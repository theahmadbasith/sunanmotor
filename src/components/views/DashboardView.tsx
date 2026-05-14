"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, formatDate, formatRupiah, cleanRupiah } from "@/lib/utils";
import type { DashboardData, RecentTransaction, DetailRestorasi } from "@/types";
import PhotoViewer from "@/components/PhotoViewer";
import { useBackButton } from "@/hooks/useBackButton";

interface DashboardViewProps {
  onNavigate: (tab: "pengeluaran" | "history", historyTab?: "jual" | "beli" | "pengeluaran") => void;
  refreshKey?: number;
  onLanjutJual?: (data: { namaMotor: string; hargaBeli: number; idBeli: string; detailRestorasi?: DetailRestorasi[]; biayaRestorasi?: number }) => void;
}

// Simple in-memory cache
let _cache: DashboardData | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 menit

export default function DashboardView({ onNavigate, refreshKey = 0, onLanjutJual }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(_cache);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState("");
  const [selectedTrx, setSelectedTrx] = useState<RecentTransaction | null>(null);
  const [hideAmount, setHideAmount] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  // Modal biaya restorasi (dari dashboard)
  const [restorasiTarget, setRestorasiTarget] = useState<RecentTransaction | null>(null);
  const [restorasiItems, setRestorasiItems] = useState<DetailRestorasi[]>([]);
  const [restorasiMode, setRestorasiMode] = useState<"detail" | "total">("detail");
  const [restorasiTotal, setRestorasiTotal] = useState("");
  const [newItemNama, setNewItemNama] = useState("");
  const [newItemBiaya, setNewItemBiaya] = useState("");
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [savingRestorasi, setSavingRestorasi] = useState(false);

  // Back button — tutup modal restorasi > detail > photo viewer
  useBackButton((!!selectedTrx || !!restorasiTarget) && !photoViewerOpen, () => {
    if (restorasiTarget) setRestorasiTarget(null);
    else if (selectedTrx) setSelectedTrx(null);
  });

  const fetchData = useCallback(async (force = false) => {
    if (!force && _cache && Date.now() - _cacheTime < CACHE_TTL) {
      setData(_cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json.status === "success") {
        _cache = json.data;
        _cacheTime = Date.now();
        setData(json.data);
        import("@/lib/offlineDB").then(({ cachePut, STORES }) => {
          cachePut(STORES.DASHBOARD, "dashboard", json.data);
        });
      } else {
        setError(json.message || "Gagal memuat data");
      }
    } catch {
      try {
        const { cacheGet, STORES } = await import("@/lib/offlineDB");
        const cached = await cacheGet(STORES.DASHBOARD, "dashboard");
        if (cached) {
          setData(cached as typeof _cache);
          setError("");
        } else {
          setError("Offline. Belum ada data tersimpan.");
        }
      } catch {
        setError("Koneksi gagal. Periksa jaringan Anda.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(refreshKey > 0);
  }, [fetchData, refreshKey]);

  useEffect(() => {
    const handler = () => {
      _cache = null;
      _cacheTime = 0;
      fetchData(true);
    };
    window.addEventListener("settings-updated", handler);
    return () => window.removeEventListener("settings-updated", handler);
  }, [fetchData]);

  // ── Restorasi handlers ──
  const openRestorasiModal = (trx: RecentTransaction) => {
    setRestorasiTarget(trx);
    const existing = trx.detailRestorasi || [];
    setRestorasiItems(existing);
    if (existing.length > 0) {
      setRestorasiMode("detail");
    } else if ((trx.biayaRestorasi || 0) > 0) {
      setRestorasiMode("total");
      setRestorasiTotal(formatRupiah(String(trx.biayaRestorasi || 0)));
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
        // Update cache lokal
        if (_cache) {
          _cache = {
            ..._cache,
            recent: _cache.recent.map((t) =>
              t.id === restorasiTarget.id
                ? { ...t, detailRestorasi: detail, biayaRestorasi }
                : t
            ),
          };
          setData({ ..._cache });
        }
        // Update selectedTrx jika masih terbuka
        setSelectedTrx((prev) =>
          prev?.id === restorasiTarget.id
            ? { ...prev, detailRestorasi: detail, biayaRestorasi }
            : prev
        );
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

  if (loading && !data) return (
    <div className="p-4 space-y-4 animate-fade-in">
      {/* Skeleton: Saldo Card */}
      <div className="rounded-3xl p-5 bg-gray-200 dark:bg-gray-700 skeleton" style={{ minHeight: "172px" }}>
        <div className="h-3 w-24 rounded-full bg-gray-300 dark:bg-gray-600 skeleton mb-3" />
        <div className="h-8 w-40 rounded-xl bg-gray-300 dark:bg-gray-600 skeleton mb-4" />
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-300/40 dark:border-gray-600/40">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="h-2.5 w-16 rounded-full bg-gray-300 dark:bg-gray-600 skeleton mb-1.5" />
              <div className="h-3.5 w-20 rounded-full bg-gray-300 dark:bg-gray-600 skeleton" />
            </div>
          ))}
        </div>
      </div>

      {/* Skeleton: Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full skeleton bg-gray-200 dark:bg-gray-700" />
            <div className="h-2.5 w-10 rounded-full skeleton bg-gray-200 dark:bg-gray-700" />
            <div className="h-5 w-6 rounded skeleton bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>

      {/* Skeleton: Recent Transactions */}
      <div>
        <div className="flex justify-between items-center mb-3 px-1">
          <div className="h-4 w-32 rounded-full skeleton bg-gray-200 dark:bg-gray-700" />
          <div className="h-6 w-16 rounded-lg skeleton bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden divide-y divide-gray-50 dark:divide-gray-700/50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3.5">
              <div className="w-9 h-9 rounded-full skeleton bg-gray-200 dark:bg-gray-700 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded-full skeleton bg-gray-200 dark:bg-gray-700 w-3/4" />
                <div className="h-2.5 rounded-full skeleton bg-gray-200 dark:bg-gray-700 w-1/3" />
              </div>
              <div className="h-3.5 w-16 rounded-full skeleton bg-gray-200 dark:bg-gray-700 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (error && !data) return (
    <div className="p-4">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
        <p className="text-red-600 dark:text-red-400 font-medium text-sm">{error}</p>
        <button onClick={() => fetchData(true)} className="mt-3 px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold">Coba Lagi</button>
      </div>
    </div>
  );

  const d = data!;

  return (
    <>
      <div className="p-4 space-y-4 animate-fade-in">
        {/* Saldo Card */}
        <div className={`rounded-3xl p-5 text-white shadow-lg relative overflow-hidden transition-all duration-300 ${
          d.saldo < 0
            ? "bg-gradient-to-br from-red-500 to-rose-700 shadow-red-500/20"
            : "bg-gradient-to-br from-brand-500 to-indigo-800 shadow-brand-500/20"
        }`}>
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-1.5">
              <p className={`text-[11px] font-semibold tracking-wide uppercase ${d.saldo < 0 ? "text-red-100" : "text-brand-100"}`}>
                {d.saldo < 0 ? "⚠️ Saldo Minus" : "Total Saldo"}
              </p>
              <button
                onClick={() => setHideAmount(!hideAmount)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all active:scale-95"
                aria-label={hideAmount ? "Tampilkan nominal" : "Sembunyikan nominal"}
              >
                {hideAmount ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-white">
                    <path d="M228,175a8,8,0,0,1-10.92-3l-19-33.2A123.23,123.23,0,0,1,162,155.46l5.87,35.22a8,8,0,0,1-6.58,9.21A8.4,8.4,0,0,1,160,200a8,8,0,0,1-7.88-6.69L146.3,158.9a124.06,124.06,0,0,1-36.6,0l-5.82,35.41A8,8,0,0,1,96,200a8.4,8.4,0,0,1-1.32-.11,8,8,0,0,1-6.58-9.21L94,155.46a123.23,123.23,0,0,1-36.06-16.69L39,172a8,8,0,1,1-13.94-7.94l20-35a8,8,0,0,1,11-2.89l.11.07A112,112,0,0,0,128,144a112,112,0,0,0,71.84-17.76l.11-.07a8,8,0,0,1,11,2.89l20,35A8,8,0,0,1,228,175Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-white">
                    <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z" />
                  </svg>
                )}
              </button>
            </div>
            
            {/* Font normalkan (text-2xl font-bold) */}
            <h2 className="text-2xl font-bold tracking-tight mb-1">
              {hideAmount ? "Rp •••••••" : (
                d.saldo < 0
                  ? `−${formatCurrency(Math.abs(d.saldo))}`
                  : formatCurrency(d.saldo)
              )}
            </h2>
            <p className={`text-[10px] ${d.saldo < 0 ? "text-red-200" : "text-brand-200/90"}`}>
              (Modal + Penjualan) − Pokok − Pengeluaran − Stok
            </p>

            <div className={`mt-4 grid grid-cols-2 gap-y-2 gap-x-2 border-t pt-3 ${d.saldo < 0 ? "border-red-400/30" : "border-white/20"}`}>
              <div>
                <p className={`text-[10px] mb-0.5 ${d.saldo < 0 ? "text-red-200" : "text-brand-100"}`}>Penjualan</p>
                <p className="font-semibold text-white text-xs">
                  {hideAmount ? "Rp •••" : formatCurrency(d.totalHargaJual)}
                </p>
              </div>
              <div>
                <p className={`text-[10px] mb-0.5 ${d.saldo < 0 ? "text-red-200" : "text-brand-100"}`}>Profit Bersih</p>
                <p className={`font-semibold text-xs ${d.totalKeuntungan < 0 ? "text-red-300" : "text-green-300"}`}>
                  {hideAmount ? "Rp •••" : (
                    d.totalKeuntungan < 0
                      ? `−${formatCurrency(Math.abs(d.totalKeuntungan))}`
                      : formatCurrency(d.totalKeuntungan)
                  )}
                </p>
              </div>
              <div>
                <p className={`text-[10px] mb-0.5 ${d.saldo < 0 ? "text-red-200" : "text-brand-100"}`}>Pengeluaran</p>
                <p className="font-semibold text-red-200 text-xs">
                  {hideAmount ? "Rp •••" : formatCurrency(d.totalPengeluaran)}
                </p>
              </div>
              <div>
                <p className={`text-[10px] mb-0.5 ${d.saldo < 0 ? "text-red-200" : "text-brand-100"}`}>Nilai Stok</p>
                <p className="font-semibold text-yellow-300 text-xs">
                  {hideAmount ? "Rp •••" : formatCurrency(d.totalHargaBeliStok)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats - Pengecilan dan Perapihan */}
        <div className="grid grid-cols-3 gap-2">
          {/* Terjual */}
          <button
            onClick={() => onNavigate("history", "jual")}
            className="group flex flex-col items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-blue-900/50 transition-all duration-300"
          >
            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium text-gray-500 mb-0.5">Terjual</p>
              <p className="font-bold text-gray-800 dark:text-white text-lg leading-none">{d.totalMotor}</p>
            </div>
          </button>

          {/* Stok */}
          <button
            onClick={() => onNavigate("history", "beli")}
            className="group flex flex-col items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all duration-300"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current">
                <path d="M214.75,82.35l-80-48a16,16,0,0,0-15.5,0l-80,48A15.93,15.93,0,0,0,32,96v64a15.93,15.93,0,0,0,7.25,13.65l80,48a15.89,15.89,0,0,0,15.5,0l80-48A15.93,15.93,0,0,0,224,160V96A15.93,15.93,0,0,0,214.75,82.35ZM128,47.88,198.2,90,128,132.12,57.8,90ZM48,106.84l72,43.2V203.8L48,160.6ZM136,203.8V150l72-43.2v53.76Z"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium text-gray-500 mb-0.5">Stok</p>
              <p className="font-bold text-gray-800 dark:text-white text-lg leading-none">{d.totalStok}</p>
            </div>
          </button>

          {/* Pengeluaran */}
          <button
            onClick={() => onNavigate("pengeluaran")}
            className="group flex flex-col items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-orange-200 dark:hover:border-orange-900/50 transition-all duration-300"
          >
            <div className="w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform duration-300">
              {/* Ikon Dompet (Wallet) */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current">
                <path d="M216,72H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,64V192a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V88A16,16,0,0,0,216,72Zm-32,80a12,12,0,1,1,12-12A12,12,0,0,1,184,152Z"/>
              </svg>
            </div>
            <div className="text-center w-full flex flex-col items-center">
              <p className="text-[10px] font-medium text-gray-500 mb-1">Pengeluaran</p>
              <div className="flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-gray-400 group-hover:fill-orange-500 transition-colors">
                  <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/>
                </svg>
              </div>
            </div>
          </button>
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex justify-between items-center mb-3 px-1">
            <h3 className="font-bold text-gray-800 dark:text-white text-sm">Aktivitas Terbaru</h3>
            <button 
              onClick={() => fetchData(true)} 
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400 font-semibold px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current">
                <path d="M224,128a96,96,0,1,1-96-96V16a8,8,0,0,1,14.92-4l44.62,77.28a8,8,0,0,1-13.84,8L136,31.81V55.53A80,80,0,1,0,208,128a8,8,0,0,1,16,0Z" />
              </svg>
              Refresh
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            {d.recent.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mb-3">
                  {/* Ikon Dokumen Kosong */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-8 h-8 fill-gray-300 dark:fill-gray-500">
                    <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200Zm-48-56a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,144Zm0-40a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,104Z" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Belum ada aktivitas</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {d.recent.slice(0, 10).map((trx) => {
                  const isIncome = trx.type === "income";
                  const isBeli = trx.type === "beli";
                  return (
                    <button
                      key={trx.id}
                      className="w-full flex items-center justify-between p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group"
                      onClick={() => setSelectedTrx(trx)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Thumbnail foto jika ada, fallback ke ikon */}
                        {trx.fotos && trx.fotos.length > 0 ? (
                          <div className="relative w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 group-hover:scale-105 transition-transform">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={trx.fotos[0]} alt={trx.title} className="w-full h-full object-cover" />
                            {trx.fotos.length > 1 && (
                              <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[7px] font-bold px-0.5 leading-tight rounded-tl">
                                +{trx.fotos.length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                            isIncome ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                            : isBeli ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                            : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                          }`}>
                            {isIncome ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z" /></svg>
                            ) : isBeli ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M208,96H184L160,72H112a16,16,0,0,0-16,16v8H80a48,48,0,1,0,0,96h8a48,48,0,0,0,93.48-16H208a32,32,0,0,0,0-64ZM80,176H72a32,32,0,0,1,0-64h8Zm80,0a32,32,0,0,1-64,0V112h64Zm48-16H176V112h32a16,16,0,0,1,0,32Z" /></svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z" /></svg>
                            )}
                          </div>
                        )}
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-gray-800 dark:text-gray-100 text-xs leading-tight truncate">{trx.title}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(trx.date)}</p>
                        </div>
                      </div>
                      <div className={`font-bold text-xs shrink-0 ${
                        isIncome ? "text-green-600 dark:text-green-400"
                        : isBeli ? "text-blue-600 dark:text-blue-400"
                        : "text-red-600 dark:text-red-400"
                      }`}>
                        {isIncome ? "+" : isBeli ? "" : "−"}{formatCurrency(trx.amount)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lihat Semua Riwayat Button */}
          {d.recent.length > 0 && (
            <button
              onClick={() => onNavigate("history")}
              className="w-full mt-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm transition-all flex items-center justify-center gap-2"
            >
              Lihat Semua Riwayat
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current">
                <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Detail modal transaksi (Muncul di tengah / scale-in) */}
      {selectedTrx && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedTrx(null)} />
          <div className="relative w-full bg-white dark:bg-gray-900 rounded-3xl shadow-2xl animate-scale-in overflow-hidden" style={{ maxWidth: "400px" }}>
            
            {/* ── Thumbnail strip foto (jika ada) ── */}
            {selectedTrx.fotos && selectedTrx.fotos.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 px-4 pt-4 pb-0">
                {selectedTrx.fotos.map((foto, fi) => (
                  <button
                    key={fi}
                    type="button"
                    onClick={() => { setPhotoViewerIndex(fi); setPhotoViewerOpen(true); }}
                    className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-transparent hover:border-brand-400 active:scale-95 transition-all"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto} alt={`Foto ${fi + 1}`} className="w-full h-full object-cover" />
                    {/* Play/zoom icon overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/30 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-white drop-shadow">
                        <path d="M229.66,218.34l-50.07-50.07a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Zm104,0a8,8,0,0,1-8,8H120v16a8,8,0,0,1-16,0V120H88a8,8,0,0,1,0-16h16V88a8,8,0,0,1,16,0v16h16A8,8,0,0,1,144,112Z" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="p-5">
              <div className="flex items-start gap-3 mb-5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  selectedTrx.type === "income" ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                  : selectedTrx.type === "beli" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                }`}>
                  {selectedTrx.type === "income" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current"><path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z" /></svg>
                  ) : selectedTrx.type === "beli" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current"><path d="M208,96H184L160,72H112a16,16,0,0,0-16,16v8H80a48,48,0,1,0,0,96h8a48,48,0,0,0,93.48-16H208a32,32,0,0,0,0-64ZM80,176H72a32,32,0,0,1,0-64h8Zm80,0a32,32,0,0,1-64,0V112h64Zm48-16H176V112h32a16,16,0,0,1,0,32Z" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current"><path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z" /></svg>
                  )}
                </div>
                <div className="pt-0.5 flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 dark:text-white text-base leading-tight mb-1 break-words">{selectedTrx.title}</h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{formatDate(selectedTrx.date)}</p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Jumlah</span>
                  <span className={`font-bold text-sm ${selectedTrx.type === "income" ? "text-green-600 dark:text-green-400" : selectedTrx.type === "beli" ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
                    {selectedTrx.type === "income" ? "+" : selectedTrx.type === "beli" ? "" : "−"}{formatCurrency(selectedTrx.amount)}
                  </span>
                </div>
                {selectedTrx.detail && (
                  <div className="flex justify-between items-start pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 font-medium shrink-0 mr-4">Detail</span>
                    <span className="font-semibold text-gray-800 dark:text-white text-right text-sm break-words">{selectedTrx.detail}</span>
                  </div>
                )}
                {/* Tampilkan biaya restorasi jika ada */}
                {selectedTrx.type === "beli" && (selectedTrx.biayaRestorasi || 0) > 0 && (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">Biaya Restorasi</span>
                      <span className="font-bold text-sm text-amber-700 dark:text-amber-400">{formatCurrency(selectedTrx.biayaRestorasi || 0)}</span>
                    </div>
                    {selectedTrx.detailRestorasi && selectedTrx.detailRestorasi.length > 0 && (
                      <div className="space-y-1 mt-1">
                        {selectedTrx.detailRestorasi.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-gray-500 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2.5 py-1.5">
                            <span className="truncate mr-2">• {item.nama}</span>
                            <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(item.biaya)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {selectedTrx.fotos && selectedTrx.fotos.length > 0 && (
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Foto</span>
                    <button
                      onClick={() => { setPhotoViewerIndex(0); setPhotoViewerOpen(true); }}
                      className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 font-semibold"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Z" /></svg>
                      Lihat {selectedTrx.fotos.length} foto
                    </button>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">ID Ref</span>
                  <span className="font-mono text-[10px] text-gray-400">{selectedTrx.id}</span>
                </div>
              </div>

              {/* Tombol Biaya Restorasi — hanya untuk stok */}
              {selectedTrx.type === "beli" && selectedTrx.detail === "Stok" && (
                <button
                  onClick={() => { openRestorasiModal(selectedTrx); setSelectedTrx(null); }}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-white">
                    <path d="M226.76,69a8,8,0,0,0-12.84-2.88l-40.3,37.19-17.23-4.5-4.5-17.23,37.19-40.3A8,8,0,0,0,186.2,28.29,72,72,0,0,0,88,96a72.34,72.34,0,0,0,1.07,12.29L45.46,152A24,24,0,0,0,79.46,186l43.66-43.54A72.34,72.34,0,0,0,135.4,143.6,72,72,0,0,0,226.76,69Z" />
                  </svg>
                  {(selectedTrx.biayaRestorasi || 0) > 0 ? `Edit Restorasi (${formatCurrency(selectedTrx.biayaRestorasi || 0)})` : "Tambah Biaya Restorasi"}
                </button>
              )}

              {selectedTrx.type === "beli" && selectedTrx.detail === "Stok" && onLanjutJual && (
                <button
                  onClick={() => {
                    const namaMotor = selectedTrx.namaMotor || selectedTrx.title.replace("Beli: ", "");
                    onLanjutJual({
                      namaMotor,
                      hargaBeli: selectedTrx.amount,
                      idBeli: selectedTrx.id,
                      detailRestorasi: selectedTrx.detailRestorasi,
                      biayaRestorasi: selectedTrx.biayaRestorasi,
                    });
                    setSelectedTrx(null);
                  }}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-bold text-xs transition-colors shadow-md shadow-brand-500/20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-white">
                    <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
                  </svg>
                  Lanjut Jual Motor Ini
                </button>
              )}
              
              <button
                onClick={() => setSelectedTrx(null)}
                className="mt-3 w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-xl font-bold text-gray-700 dark:text-gray-300 text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Viewer untuk foto di modal transaksi */}
      {selectedTrx?.fotos && selectedTrx.fotos.length > 0 && (
        <PhotoViewer
          photos={selectedTrx.fotos}
          initialIndex={photoViewerIndex}
          isOpen={photoViewerOpen}
          onClose={() => setPhotoViewerOpen(false)}
          motorName={selectedTrx.title}
        />
      )}

      {/* Modal Biaya Restorasi */}
      {restorasiTarget && (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full shadow-2xl animate-scale-in flex flex-col overflow-hidden" style={{ maxWidth: "420px", maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Biaya Restorasi</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[220px]">
                  {restorasiTarget.namaMotor || restorasiTarget.title.replace("Beli: ", "")}
                </p>
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
    </>
  );
}
