"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { formatCurrency, formatDate, formatRupiah, cleanRupiah } from "@/lib/utils";
import PhotoViewer from "@/components/PhotoViewer";
import ReportsModal from "@/components/modals/ReportsModal";
import { STORES } from "@/lib/offlineDB";
import type { MotorData, MotorBeliData, PengeluaranData, DetailRestorasi } from "@/types";
import { useBackButton } from "@/hooks/useBackButton";

const LazyPhoto = ({ data, type, alt }: { data: any; type: "jual" | "beli" | "pengeluaran"; alt: string }) => {
  const [loaded, setLoaded] = useState(false);

  const handleLoad = async () => {
    setLoaded(true);
    try {
      const { idbPut, STORES } = await import("@/lib/offlineDB");
      const store = type === "jual" ? STORES.MOTOR_JUAL : type === "beli" ? STORES.MOTOR_BELI : STORES.PENGELUARAN;
      await idbPut(store, data);
    } catch { }
  };

  return (
    <>
      {!loaded && <div className="absolute inset-0 skeleton" />}
      <img
        src={data.fotos[0]}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 relative z-10 ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
        onLoad={handleLoad}
      />
    </>
  );
};

interface HistoryViewProps {
  refreshKey ?: number;
  onLanjutJual ?: (data: { namaMotor: string; hargaBeli: number; idBeli: string; detailRestorasi?: DetailRestorasi[]; biayaRestorasi?: number }) => void;
  initialTab ?: "jual" | "beli" | "pengeluaran";
  onSwipeOutLeft ?: () => void;   // swipe kiri dari tab paling kanan (pengeluaran)
  onSwipeOutRight ?: () => void;  // swipe kanan dari tab paling kiri (jual)
}

type TabType = "jual" | "beli" | "pengeluaran";

// Simpan ke IDB secara bertahap (batch kecil) agar tidak membebani RAM
async function saveToIDBBatched(
  store: import("@/lib/offlineDB").StoreName,
  items: unknown[],
  batchSize = 20
): Promise<void> {
  const { idbPut, idbClearStore } = await import("@/lib/offlineDB");
  await idbClearStore(store);
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map((item) => idbPut(store, item)));
    // Yield ke event loop agar tidak memblokir UI
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

// Baca dari IDB
async function loadFromIDB<T>(store: import("@/lib/offlineDB").StoreName): Promise<T[]> {
  try {
    const { idbGetAll } = await import("@/lib/offlineDB");
    return await idbGetAll<T>(store);
  } catch { return []; }
}

export default function HistoryView({ refreshKey = 0, onLanjutJual, initialTab = "jual", onSwipeOutLeft, onSwipeOutRight }: HistoryViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [jualData, setJualData] = useState<MotorData[]>([]);
  const [beliData, setBeliData] = useState<MotorBeliData[]>([]);
  const [pengeluaranData, setPengeluaranData] = useState<PengeluaranData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOffline, setIsOffline] = useState(false); // tampilkan badge offline jika data dari cache

  // Photo viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
  const [viewerTitle, setViewerTitle] = useState("");

  const [reportsOpen, setReportsOpen] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: TabType; id: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expanded cards (collapsible detail)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Modal biaya restorasi
  const [restorasiTarget, setRestorasiTarget] = useState<MotorBeliData | null>(null);
  const [restorasiItems, setRestorasiItems] = useState<DetailRestorasi[]>([]);
  const [restorasiMode, setRestorasiMode] = useState<"detail" | "total">("detail");
  const [restorasiTotal, setRestorasiTotal] = useState("");
  const [newItemNama, setNewItemNama] = useState("");
  const [newItemBiaya, setNewItemBiaya] = useState("");
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [savingRestorasi, setSavingRestorasi] = useState(false);

  // Swipe animation
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Swipe state
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [pullProgress, setPullProgress] = useState(0);

  // Set active tab from initialTab prop on mount
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    document.body.style.overflow = reportsOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [reportsOpen]);

  // Back button — prioritas: viewer > delete confirm > restorasi > reports
  // PhotoViewer punya handler sendiri, jadi hanya handle delete & reports di sini
  useBackButton(
    (!!deleteTarget || reportsOpen || !!restorasiTarget) && !viewerOpen,
    () => {
      if (deleteTarget) setDeleteTarget(null);
      else if (restorasiTarget) setRestorasiTarget(null);
      else if (reportsOpen) setReportsOpen(false);
    }
  );

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const fetchData = useCallback(async () => {
    setError("");

    // ── 1. Muat dari cache IDB dulu (instant, tanpa loading spinner) ──
    const [cachedJual, cachedBeli, cachedPengeluaran] = await Promise.all([
      loadFromIDB<MotorData>(STORES.MOTOR_JUAL),
      loadFromIDB<MotorBeliData>(STORES.MOTOR_BELI),
      loadFromIDB<PengeluaranData>(STORES.PENGELUARAN),
    ]);

    const sortByDate = <T extends { tanggal: string }>(arr: T[]) =>
      [...arr].sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

    if (cachedJual.length > 0 || cachedBeli.length > 0 || cachedPengeluaran.length > 0) {
      // Tampilkan data cache langsung — tidak perlu loading
      setJualData(sortByDate(cachedJual));
      setBeliData(sortByDate(cachedBeli));
      setPengeluaranData(sortByDate(cachedPengeluaran));
      setLoading(false);
      setIsOffline(!navigator.onLine);
    } else {
      // Belum ada cache — tampilkan loading
      setLoading(true);
    }

    // ── 2. Fetch dari API di background (update cache + UI) ──
    if (!navigator.onLine) {
      setLoading(false);
      if (cachedJual.length === 0 && cachedBeli.length === 0 && cachedPengeluaran.length === 0) {
        setError("Tidak ada koneksi dan belum ada data tersimpan.");
      }
      return;
    }

    try {
      const [motorRes, beliRes, pengeluaranRes] = await Promise.all([
        fetch("/api/motor"),
        fetch("/api/beli"),
        fetch("/api/pengeluaran"),
      ]);

      const motorJson = await motorRes.json();
      const beliJson = await beliRes.json();
      const pengeluaranJson = await pengeluaranRes.json();

      if (motorJson.status === "success") {
        const sorted = sortByDate<MotorData>(motorJson.data);
        setJualData(sorted);
        // Simpan ke IDB tanpa foto base64 (hemat RAM/storage)
        const forCache = sorted.map((m: MotorData) => ({ ...m, fotos: [] }));
        saveToIDBBatched(STORES.MOTOR_JUAL, forCache).catch(() => { });
      }
      if (beliJson.status === "success") {
        const sorted = sortByDate<MotorBeliData>(beliJson.data);
        setBeliData(sorted);
        const forCache = sorted.map((b: MotorBeliData) => ({ ...b, fotos: [] }));
        saveToIDBBatched(STORES.MOTOR_BELI, forCache).catch(() => { });
      }
      if (pengeluaranJson.status === "success") {
        const sorted = sortByDate<PengeluaranData>(pengeluaranJson.data);
        setPengeluaranData(sorted);
        saveToIDBBatched(STORES.PENGELUARAN, sorted).catch(() => { });
      }
      setIsOffline(false);
    } catch {
      // Jaringan gagal — data cache sudah ditampilkan, cukup tampilkan pesan kecil
      if (cachedJual.length === 0 && cachedBeli.length === 0 && cachedPengeluaran.length === 0) {
        setError("Gagal memuat data. Periksa koneksi internet.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const TABS: TabType[] = ["jual", "beli", "pengeluaran"];

  const switchTab = (newTab: TabType) => {
    if (newTab === activeTab || isAnimating) return;
    const currentIdx = TABS.indexOf(activeTab);
    const newIdx = TABS.indexOf(newTab);
    const dir = newIdx > currentIdx ? "left" : "right";
    setSwipeDir(dir);
    setIsAnimating(true);
    setTimeout(() => {
      setActiveTab(newTab);
      setSwipeDir(null);
      setIsAnimating(false);
    }, 220);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null || isAnimating || pullProgress === -1) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (containerRef.current && containerRef.current.scrollTop <= 0 && dy > 0) {
      setPullProgress(Math.min(dy / 120, 1));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    // Pull-to-refresh logic
    if (pullProgress > 0) {
      if (pullProgress > 0.6) {
        setPullProgress(-1);
        fetchData().then(() => setPullProgress(0));
      } else {
        setPullProgress(0);
      }
    }
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    // Only trigger if horizontal swipe dominates
    if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.5) {
      if (dx > 0) {
        // Swipe kiri
        if (activeTab === "jual") switchTab("beli");
        else if (activeTab === "beli") switchTab("pengeluaran");
        else if (activeTab === "pengeluaran") onSwipeOutLeft?.(); // sudah di tab paling kanan
      } else {
        // Swipe kanan
        if (activeTab === "pengeluaran") switchTab("beli");
        else if (activeTab === "beli") switchTab("jual");
        else if (activeTab === "jual") onSwipeOutRight?.(); // sudah di tab paling kiri
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openPhotoViewer = (photos: string[], title: string) => {
    setViewerPhotos(photos);
    setViewerTitle(title);
    setViewerOpen(true);
  };

  const requestDelete = (type: TabType, id: string) => {
    setDeleteTarget({ type, id });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const endpoint = deleteTarget.type === "jual" ? "/api/motor" :
        deleteTarget.type === "beli" ? "/api/beli" : "/api/pengeluaran";

      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });

      const json = await res.json();
      if (json.status === "success") {
        if (deleteTarget.type === "jual") {
          // Cari idBeli terkait sebelum hapus dari state
          const motorTerhapus = jualData.find((m) => m.id === deleteTarget.id);
          const idBeliTerkait = motorTerhapus?.idBeli || "";

          // Hapus dari state jual
          setJualData((prev) => {
            const next = prev.filter((m) => m.id !== deleteTarget.id);
            saveToIDBBatched(STORES.MOTOR_JUAL, next.map((m) => ({ ...m, fotos: [] }))).catch(() => { });
            return next;
          });

          // Hapus juga dari state beli jika ada idBeli terkait
          if (idBeliTerkait) {
            setBeliData((prev) => {
              const next = prev.filter((b) => b.id !== idBeliTerkait);
              saveToIDBBatched(STORES.MOTOR_BELI, next.map((b) => ({ ...b, fotos: [] }))).catch(() => { });
              return next;
            });
          }
        } else if (deleteTarget.type === "beli") {
          setBeliData((prev) => {
            const next = prev.filter((b) => b.id !== deleteTarget.id);
            saveToIDBBatched(STORES.MOTOR_BELI, next.map((b) => ({ ...b, fotos: [] }))).catch(() => { });
            return next;
          });
        } else {
          setPengeluaranData((prev) => {
            const next = prev.filter((p) => p.id !== deleteTarget.id);
            saveToIDBBatched(STORES.PENGELUARAN, next).catch(() => { });
            return next;
          });
        }
        setDeleteTarget(null);
      } else {
        alert(json.message || "Gagal menghapus data");
      }
    } catch {
      alert("Koneksi gagal. Coba lagi.");
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => setDeleteTarget(null);

  // ── Restorasi handlers ──
  const openRestorasiModal = (beli: MotorBeliData) => {
    setRestorasiTarget(beli);
    const existing = beli.detailRestorasi || [];
    setRestorasiItems(existing);
    if (existing.length > 0) {
      setRestorasiMode("detail");
    } else if ((beli.biayaRestorasi || 0) > 0) {
      setRestorasiMode("total");
      setRestorasiTotal(formatRupiah(String(beli.biayaRestorasi || 0)));
    } else {
      setRestorasiMode("detail");
      setRestorasiTotal("");
    }
    setNewItemNama("");
    setNewItemBiaya("");
    setShowNewItemForm(false);
  };

  const addRestorasiItem = () => {
    const nama = newItemNama.trim();
    const biaya = cleanRupiah(newItemBiaya);
    if (!nama || biaya <= 0) return;
    setRestorasiItems((prev) => [...prev, { nama, biaya }]);
    setNewItemNama("");
    setNewItemBiaya("");
    setShowNewItemForm(false);
  };

  const removeRestorasiItem = (idx: number) => {
    setRestorasiItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveRestorasi = async () => {
    if (!restorasiTarget) return;
    setSavingRestorasi(true);
    try {
      const totalDetail = restorasiItems.reduce((s, d) => s + d.biaya, 0);
      const biayaRestorasi = restorasiMode === "detail" ? totalDetail : cleanRupiah(restorasiTotal);
      const detail = restorasiMode === "detail" ? restorasiItems : [];

      const res = await fetch("/api/beli", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idBeli: restorasiTarget.id, detailRestorasi: detail, biayaRestorasi }),
      });
      const json = await res.json();
      if (json.status === "success") {
        // Update state lokal
        setBeliData((prev) => {
          const next = prev.map((b) =>
            b.id === restorasiTarget.id
              ? { ...b, detailRestorasi: detail, biayaRestorasi }
              : b
          );
          saveToIDBBatched(STORES.MOTOR_BELI, next.map((b) => ({ ...b, fotos: [] }))).catch(() => {});
          return next;
        });
        setRestorasiTarget(null);
      } else {
        alert(json.message || "Gagal menyimpan restorasi");
      }
    } catch {
      alert("Koneksi gagal. Coba lagi.");
    } finally {
      setSavingRestorasi(false);
    }
  };

  // Show only 10 items per tab
  const displayJual = jualData.slice(0, 10);
  const displayBeli = beliData.slice(0, 10);
  const displayPengeluaran = pengeluaranData.slice(0, 10);

  return (
    <>
      <div className="flex flex-col h-full animate-fade-in">
        {/* Header */}
        <div className="p-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">Riwayat Transaksi</h2>
              {isOffline && (
                <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3 h-3 fill-current"><path d="M236.4,121.2a12,12,0,0,1-16.8,0A124.08,124.08,0,0,0,128,84a125.75,125.75,0,0,0-58.46,14.33,12,12,0,0,1-11.08-21.31A149.7,149.7,0,0,1,128,60a148.06,148.06,0,0,1,108.4,44.4A12,12,0,0,1,236.4,121.2ZM128,116a92.14,92.14,0,0,0-63.56,25.32,12,12,0,1,0,16.63,17.3A68.1,68.1,0,0,1,128,140a68.1,68.1,0,0,1,46.93,18.62,12,12,0,1,0,16.63-17.3A92.14,92.14,0,0,0,128,116Zm-28.28,68.28A40,40,0,1,1,128,212,40,40,0,0,1,99.72,184.28Z" /></svg>
                  Cache
                </span>
              )}
            </div>

            {/* TOMBOL LAPORAN (Diperkecil ukurannya tapi tetap bergaya) */}
            <button
              onClick={() => setReportsOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-lg font-semibold text-xs shadow-sm shadow-brand-500/20 hover:shadow-md hover:shadow-brand-500/40 transform hover:-translate-y-px active:scale-95 transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-white">
                <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-40-64a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,152Zm0-32a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,120Z" />
              </svg>
              Laporan
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 shrink-0">
          <button
            onClick={() => switchTab("jual")}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${activeTab === "jual"
              ? "text-brand-600 dark:text-brand-400 border-brand-500"
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-transparent"
              }`}
          >
            Jual ({jualData.length})
          </button>
          <button
            onClick={() => switchTab("beli")}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${activeTab === "beli"
              ? "text-brand-600 dark:text-brand-400 border-brand-500"
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-transparent"
              }`}
          >
            Beli ({beliData.length})
          </button>
          <button
            onClick={() => switchTab("pengeluaran")}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${activeTab === "pengeluaran"
              ? "text-brand-600 dark:text-brand-400 border-brand-500"
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-transparent"
              }`}
          >
            Pengeluaran ({pengeluaranData.length})
          </button>
        </div>

        {/* Content */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-4 scrollbar-hide"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Pull to Refresh Indicator */}
          {(pullProgress > 0 || pullProgress === -1) && (
            <div
              className="flex justify-center items-center overflow-hidden transition-all duration-200"
              style={{ height: pullProgress === -1 ? '48px' : `${pullProgress * 48}px`, opacity: pullProgress === -1 ? 1 : pullProgress }}
            >
              {pullProgress === -1 ? (
                <div className="spinner !w-6 !h-6" />
              ) : (
                <span className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current rotate-180"><path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z" /></svg>
                  Lepas untuk refresh
                </span>
              )}
            </div>
          )}

          {/* Swipe animation keyframes */}
          <style>{`
            @keyframes swipeOutLeft { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-32px); } }
            @keyframes swipeOutRight { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(32px); } }
            @keyframes swipeIn { from { opacity:0; transform:translateX(0); } to { opacity:1; transform:translateX(0); } }
          `}</style>
          {loading ? (
            <div className="space-y-3 pt-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="card p-3.5 flex gap-3">
                  <div className="w-14 h-14 rounded-xl shrink-0 skeleton" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded skeleton w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded skeleton w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
              <p className="text-red-600 dark:text-red-400 font-medium text-sm">{error}</p>
              <button onClick={fetchData} className="mt-3 px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold">
                Coba Lagi
              </button>
            </div>
          ) : (
            <div
              style={{
                animation: swipeDir
                  ? `swipeOut${swipeDir === "left" ? "Left" : "Right"} 0.22s ease forwards`
                  : "swipeIn 0.22s ease forwards",
              }}
            >
              {/* JUAL TAB */}
              {activeTab === "jual" && (
                <div className="space-y-2">
                  {displayJual.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-12 h-12 fill-gray-300 dark:fill-gray-600 mx-auto mb-2">
                        <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" />
                      </svg>
                      Belum ada penjualan
                    </div>
                  ) : (
                    displayJual.map((motor) => {
                      const isOpen = expandedIds.has(motor.id);
                      return (
                        <div key={motor.id} className="card overflow-hidden">
                          <button type="button" onClick={() => toggleExpand(motor.id)} className="w-full flex gap-3 p-3.5 text-left">
                            {motor.fotos.length > 0 ? (
                              <div onClick={(e) => { e.stopPropagation(); openPhotoViewer(motor.fotos, motor.namaMotor); }} className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-700">
                                <LazyPhoto data={motor} type="jual" alt={motor.namaMotor} />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded-xl shrink-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-gray-300 dark:fill-gray-600"><path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.65-3.56L100.28,48h55.44l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z" /></svg>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="font-bold text-gray-800 dark:text-white text-sm leading-tight truncate">{motor.namaMotor}</p>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(motor.tanggal)}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`text-sm font-extrabold ${motor.untungBersih >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                    {motor.untungBersih >= 0 ? "+" : ""}{formatCurrency(motor.untungBersih)}
                                  </span>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={`w-4 h-4 fill-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" /></svg>
                                </div>
                              </div>
                              {!isOpen && (
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Jual {formatCurrency(motor.hargaJual)} · Modal {formatCurrency(motor.totalModal)}</p>
                              )}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="mx-3 mb-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 overflow-hidden">
                              <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 dark:divide-gray-700">
                                <div className="p-2.5"><p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Harga Beli</p><p className="text-xs font-bold text-gray-700 dark:text-gray-200 mt-0.5">{formatCurrency(motor.hargaBeli)}</p></div>
                                <div className="p-2.5">
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Biaya Restorasi</p>
                                  <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-0.5">{formatCurrency(motor.biayaReparasi)}</p>
                                  {/* Detail restorasi */}
                                  {motor.detailRestorasi && motor.detailRestorasi.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {motor.detailRestorasi.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                                          <span className="truncate mr-1">• {item.nama}</span>
                                          <span className="shrink-0 font-semibold">{formatCurrency(item.biaya)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="p-2.5"><p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Total Modal</p><p className="text-xs font-bold text-orange-600 dark:text-orange-400 mt-0.5">{formatCurrency(motor.totalModal)}</p></div>
                                <div className="p-2.5"><p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Harga Jual</p><p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">{formatCurrency(motor.hargaJual)}</p></div>
                              </div>
                              <div className={`flex items-center justify-between px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 ${motor.untungBersih >= 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                                <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Untung Bersih</span>
                                <span className={`text-sm font-extrabold ${motor.untungBersih >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{motor.untungBersih >= 0 ? "+" : ""}{formatCurrency(motor.untungBersih)}</span>
                              </div>
                              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-700">
                                {motor.fotos.length > 0 ? (
                                  <button onClick={() => openPhotoViewer(motor.fotos, motor.namaMotor)} className="flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-400 font-semibold">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Z" /></svg>
                                    {motor.fotos.length} foto
                                  </button>
                                ) : <span />}
                                <button onClick={() => requestDelete("jual", motor.id)} className="flex items-center gap-1 text-[11px] text-red-500 font-semibold">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192Z" /></svg>
                                  Hapus
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  {jualData.length > 10 && <p className="text-center text-xs text-gray-400 mt-3">Menampilkan 10 dari {jualData.length} penjualan</p>}
                </div>
              )}

              {/* BELI TAB */}
              {activeTab === "beli" && (
                <div className="space-y-2">
                  {displayBeli.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-12 h-12 fill-gray-300 dark:fill-gray-600 mx-auto mb-2"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" /></svg>
                      Belum ada pembelian
                    </div>
                  ) : (
                    displayBeli.map((beli) => {
                      const isOpen = expandedIds.has(beli.id);
                      return (
                        <div key={beli.id} className="card overflow-hidden">
                          <button type="button" onClick={() => toggleExpand(beli.id)} className="w-full flex gap-3 p-3.5 text-left">
                            {beli.fotos.length > 0 ? (
                              <div onClick={(e) => { e.stopPropagation(); openPhotoViewer(beli.fotos, beli.namaMotor); }} className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-700">
                                <LazyPhoto data={beli} type="beli" alt={beli.namaMotor} />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded-xl shrink-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-gray-300 dark:fill-gray-600"><path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.65-3.56L100.28,48h55.44l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z" /></svg>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="font-bold text-gray-800 dark:text-white text-sm leading-tight truncate">{beli.namaMotor}</p>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(beli.tanggal)}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${beli.status === "stok" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>{beli.status === "stok" ? "Stok" : "Terjual"}</span>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={`w-4 h-4 fill-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" /></svg>
                                </div>
                              </div>
                              {!isOpen && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Harga beli {formatCurrency(beli.hargaBeli)}</p>}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="mx-3 mb-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 overflow-hidden">
                              <div className="p-2.5">
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Harga Beli</p>
                                <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">{formatCurrency(beli.hargaBeli)}</p>
                              </div>
                              {/* Tampilkan biaya restorasi jika ada */}
                              {((beli.biayaRestorasi || 0) > 0 || (beli.detailRestorasi && beli.detailRestorasi.length > 0)) && (
                                <div className="px-2.5 pb-2.5 border-t border-gray-100 dark:border-gray-700 pt-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wide">Biaya Restorasi</p>
                                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">{formatCurrency(beli.biayaRestorasi || 0)}</p>
                                  </div>
                                  {beli.detailRestorasi && beli.detailRestorasi.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {beli.detailRestorasi.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                                          <span className="truncate mr-1">• {item.nama}</span>
                                          <span className="shrink-0 font-semibold">{formatCurrency(item.biaya)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-700">
                                {beli.fotos.length > 0 ? (
                                  <button onClick={() => openPhotoViewer(beli.fotos, beli.namaMotor)} className="flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-400 font-semibold">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Z" /></svg>
                                    {beli.fotos.length} foto
                                  </button>
                                ) : <span />}
                                <div className="flex items-center gap-2">
                                  {/* Tombol hapus hanya untuk motor yang masih stok (belum terjual) */}
                                  {beli.status === "stok" && (
                                    <button onClick={() => requestDelete("beli", beli.id)} className="flex items-center gap-1 text-[11px] text-red-500 font-semibold">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192Z" /></svg>
                                      Hapus
                                    </button>
                                  )}
                                  {beli.status === "terjual" && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">Hapus dari tab Jual</span>
                                  )}
                                </div>
                              </div>
                              {/* Tombol Biaya Restorasi — hanya untuk stok */}
                              {beli.status === "stok" && (
                                <div className="px-3 pb-2">
                                  <button
                                    onClick={() => openRestorasiModal(beli)}
                                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs transition-colors shadow-sm"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-white">
                                      <path d="M226.76,69a8,8,0,0,0-12.84-2.88l-40.3,37.19-17.23-4.5-4.5-17.23,37.19-40.3A8,8,0,0,0,186.2,28.29,72,72,0,0,0,88,96a72.34,72.34,0,0,0,1.07,12.29L45.46,152A24,24,0,0,0,79.46,186l43.66-43.54A72.34,72.34,0,0,0,135.4,143.6,72,72,0,0,0,226.76,69Z" />
                                    </svg>
                                    {(beli.biayaRestorasi || 0) > 0 ? `Edit Restorasi (${formatCurrency(beli.biayaRestorasi || 0)})` : "Tambah Biaya Restorasi"}
                                  </button>
                                </div>
                              )}
                              {beli.status === "stok" && onLanjutJual && (
                                <div className="px-3 pb-3">
                                  <button
                                    onClick={() => onLanjutJual({ namaMotor: beli.namaMotor, hargaBeli: beli.hargaBeli, idBeli: beli.id, detailRestorasi: beli.detailRestorasi, biayaRestorasi: beli.biayaRestorasi })}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-bold text-sm transition-colors shadow-sm"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-white">
                                      <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
                                    </svg>
                                    Lanjut Jual Motor Ini
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  {beliData.length > 10 && <p className="text-center text-xs text-gray-400 mt-3">Menampilkan 10 dari {beliData.length} pembelian</p>}
                </div>
              )}

              {/* PENGELUARAN TAB */}
              {activeTab === "pengeluaran" && (
                <div className="space-y-2">
                  {displayPengeluaran.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-12 h-12 fill-gray-300 dark:fill-gray-600 mx-auto mb-2"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" /></svg>
                      Belum ada pengeluaran
                    </div>
                  ) : (
                    displayPengeluaran.map((pengeluaran) => {
                      const isOpen = expandedIds.has(pengeluaran.id);
                      const hasFotos = pengeluaran.fotos && pengeluaran.fotos.length > 0;
                      return (
                        <div key={pengeluaran.id} className="card overflow-hidden">
                          <button
                            type="button"
                            onClick={() => hasFotos ? toggleExpand(pengeluaran.id) : undefined}
                            className={`w-full flex items-center gap-3 p-3.5 text-left ${!hasFotos ? "cursor-default" : ""}`}
                          >
                            {/* Thumbnail nota atau ikon dompet */}
                            {hasFotos ? (
                              <div
                                onClick={(e) => { e.stopPropagation(); openPhotoViewer(pengeluaran.fotos, pengeluaran.keperluan); }}
                                className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-700"
                              >
                                <LazyPhoto data={pengeluaran} type="pengeluaran" alt={pengeluaran.keperluan} />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" style={{ width: "18px", height: "18px" }} className="fill-red-500 dark:fill-red-400">
                                  <path d="M216,72H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,64V192a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V88A16,16,0,0,0,216,72Zm0,128H56a8,8,0,0,1-8-8V86.63A23.84,23.84,0,0,0,56,88H216Zm-48-60a12,12,0,1,1,12,12A12,12,0,0,1,168,140Z" />
                                </svg>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-800 dark:text-white text-sm truncate">{pengeluaran.keperluan}</p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(pengeluaran.tanggal)}</p>
                              {hasFotos && (
                                <p className="text-[10px] text-brand-500 dark:text-brand-400 mt-0.5 flex items-center gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3 h-3 fill-current"><path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Z" /></svg>
                                  {pengeluaran.fotos.length} bukti nota
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <p className="font-extrabold text-red-600 dark:text-red-400 text-sm">{formatCurrency(pengeluaran.nominal)}</p>
                              {hasFotos ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={`w-4 h-4 fill-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" /></svg>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); requestDelete("pengeluaran", pengeluaran.id); }}
                                  className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center transition-colors"
                                  aria-label="Hapus"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192Z" /></svg>
                                </button>
                              )}
                            </div>
                          </button>
                          {/* Expanded detail dengan foto */}
                          {hasFotos && isOpen && (
                            <div className="mx-3 mb-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                                <button
                                  onClick={() => openPhotoViewer(pengeluaran.fotos, pengeluaran.keperluan)}
                                  className="flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-400 font-semibold"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Z" /></svg>
                                  Lihat {pengeluaran.fotos.length} bukti nota
                                </button>
                                <button
                                  onClick={() => requestDelete("pengeluaran", pengeluaran.id)}
                                  className="flex items-center gap-1 text-[11px] text-red-500 font-semibold"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192Z" /></svg>
                                  Hapus
                                </button>
                              </div>
                              {/* Thumbnail strip */}
                              <div className="flex gap-2 p-2 overflow-x-auto">
                                {pengeluaran.fotos.map((foto, fi) => (
                                  <button
                                    key={fi}
                                    type="button"
                                    onClick={() => openPhotoViewer(pengeluaran.fotos, pengeluaran.keperluan)}
                                    className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-200 dark:bg-gray-700"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={foto} alt={`Nota ${fi + 1}`} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  {pengeluaranData.length > 10 && <p className="text-center text-xs text-gray-400 mt-3">Menampilkan 10 dari {pengeluaranData.length} pengeluaran</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Biaya Restorasi */}
      {restorasiTarget && (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full shadow-2xl animate-scale-in flex flex-col overflow-hidden" style={{ maxWidth: "420px", maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Biaya Restorasi</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[220px]">{restorasiTarget.namaMotor}</p>
              </div>
              <button onClick={() => setRestorasiTarget(null)} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" /></svg>
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-2 px-5 pt-4 shrink-0">
              <button
                onClick={() => setRestorasiMode("detail")}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${restorasiMode === "detail" ? "bg-amber-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}
              >
                Per Item (Detail)
              </button>
              <button
                onClick={() => setRestorasiMode("total")}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${restorasiMode === "total" ? "bg-amber-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}
              >
                Input Total Langsung
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {restorasiMode === "total" ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Total Biaya Restorasi</label>
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3">
                    <span className="text-sm font-bold text-gray-500">Rp</span>
                    <input
                      type="text" inputMode="numeric"
                      value={restorasiTotal}
                      onChange={(e) => setRestorasiTotal(formatRupiah(e.target.value))}
                      className="flex-1 py-3 bg-transparent text-sm font-bold text-gray-800 dark:text-white outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* List item */}
                  {restorasiItems.length > 0 && (
                    <div className="space-y-1.5">
                      {restorasiItems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2.5 border border-amber-100 dark:border-amber-800">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{item.nama}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatCurrency(item.biaya)}</span>
                            <button type="button" onClick={() => removeRestorasiItem(idx)} className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-bold text-amber-800 dark:text-amber-300 px-1 pt-1 border-t border-amber-200 dark:border-amber-700">
                        <span>Total Restorasi</span>
                        <span>{formatCurrency(restorasiItems.reduce((s, d) => s + d.biaya, 0))}</span>
                      </div>
                    </div>
                  )}

                  {/* Form tambah item */}
                  {showNewItemForm ? (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700 space-y-2">
                      <input
                        type="text"
                        value={newItemNama}
                        onChange={(e) => setNewItemNama(e.target.value)}
                        className="input-field text-sm"
                        placeholder="Nama item (cth: Oli, Bengkel, Cat)"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <div className="flex items-center gap-2 flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-3">
                          <span className="text-sm font-bold text-gray-500">Rp</span>
                          <input
                            type="text" inputMode="numeric"
                            value={newItemBiaya}
                            onChange={(e) => setNewItemBiaya(formatRupiah(e.target.value))}
                            className="flex-1 py-2.5 bg-transparent text-sm font-bold text-gray-800 dark:text-white outline-none"
                            placeholder="0"
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRestorasiItem(); } }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={addRestorasiItem}
                          disabled={!newItemNama.trim() || !newItemBiaya}
                          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 shrink-0"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setShowNewItemForm(false); setNewItemNama(""); setNewItemBiaya(""); }}
                        className="text-xs text-gray-500 font-semibold"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewItemForm(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-semibold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" /></svg>
                      Tambah Item Restorasi
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
              <button
                onClick={saveRestorasi}
                disabled={savingRestorasi}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
              >
                {savingRestorasi ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                ) : (
                  <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-white"><path d="M219.31,72,184,36.69A15.86,15.86,0,0,0,172.69,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V83.31A15.86,15.86,0,0,0,219.31,72ZM168,208H88V152h80Zm40,0H184V152a16,16,0,0,0-16-16H88a16,16,0,0,0-16,16v56H48V48H172.69L208,83.31Z" /></svg>Simpan Biaya Restorasi</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Viewer */}
      <PhotoViewer
        photos={viewerPhotos}
        initialIndex={0}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        motorName={viewerTitle}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center px-6 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-red-500">
                <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white text-center mb-1">Hapus Data?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
              {deleteTarget?.type === "jual"
                ? "Data penjualan ini akan dihapus permanen beserta data pembelian terkait di tab Beli. Tindakan ini tidak dapat dibatalkan."
                : "Data ini akan dihapus permanen dari Google Sheets. Tindakan ini tidak dapat dibatalkan."
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm active:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Menghapus...
                  </>
                ) : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reports Modal */}
      <ReportsModal isOpen={reportsOpen} onClose={() => setReportsOpen(false)} />
    </>
  );
}
