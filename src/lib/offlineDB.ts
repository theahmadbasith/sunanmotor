/**
 * offlineDB.ts — IndexedDB layer untuk Sunan Motor
 * Menyimpan semua data lokal + antrian sync ke server
 */

const DB_NAME = "sunan_motor_db";
const DB_VERSION = 3;

// Store names
export const STORES = {
  FORM_DRAFTS: "form_drafts",       // draft form (beli/jual/tarik)
  MOTOR_BELI: "motor_beli",         // data pembelian motor (cache read)
  MOTOR_JUAL: "motor_jual",         // data penjualan motor (cache read)
  PENGELUARAN: "pengeluaran",       // data pengeluaran (cache read)
  DASHBOARD: "dashboard",           // cache dashboard
  SYNC_QUEUE: "sync_queue",         // antrian upload ke server
  SETTINGS: "settings",             // cache settings
} as const;

export type StoreName = typeof STORES[keyof typeof STORES];

// Tipe antrian sync
export type SyncAction = "motor_beli" | "motor_jual" | "pengeluaran";

export interface SyncQueueItem {
  id: string;                 // ID unik antrian
  action: SyncAction;         // jenis operasi
  payload: unknown;           // data yang akan dikirim
  fotos?: { name: string; base64: string }[]; // foto (base64)
  createdAt: number;          // timestamp
  attempts: number;           // jumlah percobaan
  status: "pending" | "uploading" | "done" | "failed";
  error?: string;
}

// ============================================================
// BUKA DB
// ============================================================

let _db: IDBDatabase | null = null;

export function openOfflineDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // Buat semua store jika belum ada
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          if (store === STORES.SYNC_QUEUE) {
            db.createObjectStore(store, { keyPath: "id" });
          } else if (store === STORES.FORM_DRAFTS || store === STORES.SETTINGS || store === STORES.DASHBOARD) {
            db.createObjectStore(store, { keyPath: "key" });
          } else {
            // motor_beli, motor_jual, pengeluaran — keyed by id
            db.createObjectStore(store, { keyPath: "id" });
          }
        }
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// GENERIC HELPERS
// ============================================================

export async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

export async function idbPut(store: StoreName, value: unknown): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silent */ }
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* silent */ }
}

export async function idbClearStore(store: StoreName): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* silent */ }
}

// ============================================================
// CACHE HELPERS (key-value stores)
// ============================================================

export async function cacheGet<T>(store: StoreName, key: string): Promise<T | null> {
  const record = await idbGet<{ key: string; data: T; updatedAt: number }>(store, key);
  return record?.data ?? null;
}

export async function cachePut(store: StoreName, key: string, data: unknown): Promise<void> {
  await idbPut(store, { key, data, updatedAt: Date.now() });
}

export async function cacheDelete(store: StoreName, key: string): Promise<void> {
  await idbDelete(store, key);
}

// ============================================================
// SYNC QUEUE
// ============================================================

export async function syncQueueAdd(item: Omit<SyncQueueItem, "id" | "attempts" | "status" | "createdAt">): Promise<string> {
  const id = `sq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const queueItem: SyncQueueItem = {
    ...item,
    id,
    attempts: 0,
    status: "pending",
    createdAt: Date.now(),
  };
  await idbPut(STORES.SYNC_QUEUE, queueItem);
  return id;
}

export async function syncQueueGetPending(): Promise<SyncQueueItem[]> {
  const all = await idbGetAll<SyncQueueItem>(STORES.SYNC_QUEUE);
  return all
    .filter((i) => i.status === "pending" || i.status === "failed")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function syncQueueUpdate(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
  const item = await idbGet<SyncQueueItem>(STORES.SYNC_QUEUE, id);
  if (!item) return;
  await idbPut(STORES.SYNC_QUEUE, { ...item, ...updates });
}

export async function syncQueueRemove(id: string): Promise<void> {
  await idbDelete(STORES.SYNC_QUEUE, id);
}

export async function syncQueueCount(): Promise<number> {
  const pending = await syncQueueGetPending();
  return pending.length;
}

// ============================================================
// CLEAR ALL CACHE
// ============================================================

export async function clearAllCache(): Promise<void> {
  const storesToClear: StoreName[] = [
    STORES.FORM_DRAFTS,
    STORES.MOTOR_BELI,
    STORES.MOTOR_JUAL,
    STORES.PENGELUARAN,
    STORES.DASHBOARD,
    STORES.SETTINGS,
    // SYNC_QUEUE tidak dihapus — bisa ada data pending
  ];
  await Promise.all(storesToClear.map((s) => idbClearStore(s)));

  // Hapus cache Service Worker
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

export async function clearEverything(): Promise<void> {
  // Hapus semua store termasuk sync queue
  await Promise.all(Object.values(STORES).map((s) => idbClearStore(s as StoreName)));

  // Hapus cache SW
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  // Hapus localStorage & sessionStorage
  localStorage.clear();
  sessionStorage.clear();
}
