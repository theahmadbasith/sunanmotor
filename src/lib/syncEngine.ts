/**
 * syncEngine.ts — Upload antrian offline ke server
 * Dipanggil saat online, menampilkan progress detail
 */

import {
  syncQueueGetPending,
  syncQueueUpdate,
  syncQueueRemove,
  idbClearStore,
  idbPut,
  STORES,
  type SyncQueueItem,
} from "@/lib/offlineDB";

export interface SyncProgress {
  total: number;
  done: number;
  current: string;       // deskripsi item yang sedang diproses
  percent: number;       // 0-100
  phase: "idle" | "syncing" | "done" | "error";
  errors: string[];
}

type ProgressCallback = (progress: SyncProgress) => void;

// ============================================================
// MAIN SYNC FUNCTION
// ============================================================

export async function runSync(onProgress?: ProgressCallback): Promise<SyncProgress> {
  const queue = await syncQueueGetPending();

  const result: SyncProgress = {
    total: queue.length,
    done: 0,
    current: "",
    percent: 0,
    phase: queue.length === 0 ? "done" : "syncing",
    errors: [],
  };

  if (queue.length === 0) {
    onProgress?.(result);
    return result;
  }

  onProgress?.({ ...result, current: `Memulai sinkronisasi ${queue.length} item...` });

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    result.current = describeItem(item);
    result.percent = Math.round((i / queue.length) * 100);
    onProgress?.({ ...result });

    // Mark as uploading
    await syncQueueUpdate(item.id, { status: "uploading", attempts: item.attempts + 1 });

    try {
      await uploadItem(item, (subMsg) => {
        onProgress?.({ ...result, current: subMsg });
      });

      // Sukses — hapus dari antrian
      await syncQueueRemove(item.id);
      result.done++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Gagal upload";
      result.errors.push(`${item.action}: ${errMsg}`);
      await syncQueueUpdate(item.id, {
        status: item.attempts >= 3 ? "failed" : "pending",
        error: errMsg,
      });
    }

    result.percent = Math.round(((i + 1) / queue.length) * 100);
    onProgress?.({ ...result });
  }

  // Setelah sync selesai, refresh cache data dari server
  if (result.errors.length === 0) {
    result.current = "Memperbarui data lokal...";
    result.percent = 95;
    onProgress?.({ ...result });
    await refreshLocalCache(onProgress ? (msg) => onProgress({ ...result, current: msg }) : undefined);
  }

  result.phase = result.errors.length > 0 ? "error" : "done";
  result.percent = 100;
  result.current = result.errors.length > 0
    ? `Selesai dengan ${result.errors.length} error`
    : "Semua data berhasil disinkronkan!";
  onProgress?.({ ...result });

  return result;
}

// ============================================================
// UPLOAD SATU ITEM
// ============================================================

async function uploadItem(item: SyncQueueItem, onSubProgress?: (msg: string) => void): Promise<void> {
  if (item.action === "motor_beli") {
    await uploadMotorBeli(item, onSubProgress);
  } else if (item.action === "motor_jual") {
    await uploadMotorJual(item, onSubProgress);
  } else if (item.action === "pengeluaran") {
    await uploadPengeluaran(item, onSubProgress);
  }
}

async function uploadMotorBeli(item: SyncQueueItem, onSubProgress?: (msg: string) => void): Promise<void> {
  const payload = item.payload as Record<string, unknown>;
  const fotos = item.fotos || [];

  onSubProgress?.(`Upload data beli: ${payload.namaMotor}...`);

  const res = await fetch("/api/beli", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, fotos }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || `HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.status !== "success") throw new Error(json.message || "Gagal");

  // Update cache lokal dengan ID dari server
  if (json.data?.id) {
    await idbPut(STORES.MOTOR_BELI, {
      ...payload,
      id: json.data.id,
      fotos: json.data.fotoUrls || [],
      status: "stok",
      _synced: true,
    });
    // Hapus record offline sementara
    if (payload._offlineId) {
      const { idbDelete } = await import("@/lib/offlineDB");
      await idbDelete(STORES.MOTOR_BELI, payload._offlineId as string);
    }
  }
}

async function uploadMotorJual(item: SyncQueueItem, onSubProgress?: (msg: string) => void): Promise<void> {
  const payload = item.payload as Record<string, unknown>;
  const fotos = item.fotos || [];

  onSubProgress?.(`Upload data jual: ${payload.namaMotor}...`);

  const res = await fetch("/api/motor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, fotos }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || `HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.status !== "success") throw new Error(json.message || "Gagal");

  if (json.data?.id) {
    await idbPut(STORES.MOTOR_JUAL, {
      ...payload,
      id: json.data.id,
      fotos: json.data.fotoUrls || [],
      _synced: true,
    });
    if (payload._offlineId) {
      const { idbDelete } = await import("@/lib/offlineDB");
      await idbDelete(STORES.MOTOR_JUAL, payload._offlineId as string);
    }
  }
}

async function uploadPengeluaran(item: SyncQueueItem, onSubProgress?: (msg: string) => void): Promise<void> {
  const payload = item.payload as Record<string, unknown>;
  const fotos = item.fotos || [];

  onSubProgress?.(`Upload pengeluaran: ${payload.keperluan}...`);

  const res = await fetch("/api/pengeluaran", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, fotos }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || `HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.status !== "success") throw new Error(json.message || "Gagal");

  if (json.data?.id) {
    await idbPut(STORES.PENGELUARAN, {
      ...payload,
      id: json.data.id,
      fotos: json.data.fotoUrls || [],
      folderId: json.data.folderId || "",
      _synced: true,
    });
    if (payload._offlineId) {
      const { idbDelete } = await import("@/lib/offlineDB");
      await idbDelete(STORES.PENGELUARAN, payload._offlineId as string);
    }
  }
}

// ============================================================
// REFRESH CACHE LOKAL DARI SERVER
// ============================================================

export async function refreshLocalCache(onMsg?: (msg: string) => void): Promise<void> {
  try {
    onMsg?.("Memuat data penjualan...");
    const [rMotor, rBeli, rExp, rDash] = await Promise.allSettled([
      fetch("/api/motor").then((r) => r.json()),
      fetch("/api/beli").then((r) => r.json()),
      fetch("/api/pengeluaran").then((r) => r.json()),
      fetch("/api/dashboard").then((r) => r.json()),
    ]);

    if (rMotor.status === "fulfilled" && rMotor.value.status === "success") {
      await idbClearStore(STORES.MOTOR_JUAL);
      for (const item of rMotor.value.data) {
        await idbPut(STORES.MOTOR_JUAL, { ...item, _synced: true });
      }
      onMsg?.(`${rMotor.value.data.length} data penjualan diperbarui`);
    }

    if (rBeli.status === "fulfilled" && rBeli.value.status === "success") {
      await idbClearStore(STORES.MOTOR_BELI);
      for (const item of rBeli.value.data) {
        await idbPut(STORES.MOTOR_BELI, { ...item, _synced: true });
      }
      onMsg?.(`${rBeli.value.data.length} data pembelian diperbarui`);
    }

    if (rExp.status === "fulfilled" && rExp.value.status === "success") {
      await idbClearStore(STORES.PENGELUARAN);
      for (const item of rExp.value.data) {
        await idbPut(STORES.PENGELUARAN, { ...item, _synced: true });
      }
      onMsg?.(`${rExp.value.data.length} data pengeluaran diperbarui`);
    }

    if (rDash.status === "fulfilled" && rDash.value.status === "success") {
      const { cachePut } = await import("@/lib/offlineDB");
      await cachePut(STORES.DASHBOARD, "dashboard", rDash.value.data);
      onMsg?.("Dashboard diperbarui");
    }
  } catch { /* silent — tidak fatal */ }
}

// ============================================================
// HELPERS
// ============================================================

function describeItem(item: SyncQueueItem): string {
  const payload = item.payload as Record<string, unknown>;
  const name = (payload.namaMotor || payload.keperluan || "data") as string;
  const fotoCount = item.fotos?.length || 0;

  if (item.action === "motor_beli") return `Upload beli: ${name}${fotoCount > 0 ? ` + ${fotoCount} foto` : ""}`;
  if (item.action === "motor_jual") return `Upload jual: ${name}${fotoCount > 0 ? ` + ${fotoCount} foto` : ""}`;
  if (item.action === "pengeluaran") return `Upload pengeluaran: ${name}${fotoCount > 0 ? ` + ${fotoCount} nota` : ""}`;
  return `Upload ${item.action}`;
}
