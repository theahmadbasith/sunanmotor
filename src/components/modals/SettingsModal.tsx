"use client";

import { useEffect, useState, useRef } from "react";
import type { AppSettings, LockMode } from "@/types";
import PatternLock from "@/components/PatternLock";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"umum" | "keamanan" | "sistem">("umum");
  const [settings, setSettings] = useState<Partial<AppSettings> & { lockMode?: LockMode }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Security states
  const [secAction, setSecAction] = useState<"none" | "change-pin" | "change-password" | "change-lock-mode" | "change-pattern">("none");
  const [currentCred, setCurrentCred] = useState("");
  const [newCred, setNewCred] = useState("");
  const [confirmCred, setConfirmCred] = useState("");
  const [selectedLockMode, setSelectedLockMode] = useState<LockMode>("pin");

  // Pattern steps
  const [patternStep, setPatternStep] = useState<"verify-old" | "draw-first" | "draw-confirm">("draw-first");
  const [oldPatternInput, setOldPatternInput] = useState("");
  const [firstPattern, setFirstPattern] = useState("");
  const [patternReady, setPatternReady] = useState(false);
  const [hasExistingPattern, setHasExistingPattern] = useState(false);

  // Setup sheet state
  const [setupLoading, setSetupLoading] = useState(false);
  const [cleanDriveLoading, setCleanDriveLoading] = useState(false);

  // Swipe animation
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const TABS = ["umum", "keamanan", "sistem"] as const;

  const switchTab = (newTab: typeof activeTab) => {
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
      setError(""); setSuccess("");
    }, 220);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.5) {
      const currentIdx = TABS.indexOf(activeTab);
      if (dx > 0 && currentIdx < TABS.length - 1) switchTab(TABS[currentIdx + 1]);
      else if (dx < 0 && currentIdx > 0) switchTab(TABS[currentIdx - 1]);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const resetSecState = () => {
    setSecAction("none");
    setCurrentCred(""); setNewCred(""); setConfirmCred("");
    setPatternStep("draw-first"); setOldPatternInput(""); setFirstPattern(""); setPatternReady(false);
    setError(""); setSuccess("");
  };

  useEffect(() => {
    if (!isOpen) { resetSecState(); setActiveTab("umum"); return; }
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      try {
        const cached = localStorage.getItem("app_settings");
        if (cached) {
          const parsed = JSON.parse(cached);
          setSettings(parsed);
          if (parsed.lockMode) setSelectedLockMode(parsed.lockMode);
        }
      } catch { /* ignore */ }
      fetchSettings(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchSettings = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      if (json.status === "success") {
        setSettings(json.data);
        setSelectedLockMode(json.data.lockMode || "pin");
        setHasExistingPattern(!!(json.data.lockPattern && json.data.lockPattern.length > 0));
        localStorage.setItem("app_settings", JSON.stringify(json.data));
      } else {
        if (!isBackground) setError(json.message || "Gagal memuat pengaturan");
      }
    } catch {
      if (!isBackground) setError("Terjadi kesalahan jaringan (Offline)");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUmum = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = {
        namaUsaha: settings.namaUsaha,
        namaPemilik: settings.namaPemilik,
        nomorWa: settings.nomorWa,
        catatanWelcome: settings.catatanWelcome,
        modalAwal: settings.modalAwal ?? 0,
      };
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.status === "success") {
        localStorage.setItem("app_settings", JSON.stringify({ ...settings, ...payload }));
        window.dispatchEvent(new Event("settings-updated"));
        setSuccess("Pengaturan umum berhasil disimpan");
        setTimeout(() => setSuccess(""), 3000);
      } else setError(json.message || "Gagal menyimpan");
    } catch {
      setError("Terjadi kesalahan jaringan (Anda mungkin sedang offline)");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = { action: secAction };
      if (secAction === "change-lock-mode") {
        body.lockMode = selectedLockMode;
      } else {
        if (newCred !== confirmCred) { setError("Konfirmasi tidak cocok."); setSaving(false); return; }
        body.currentCredential = currentCred;
        if (secAction === "change-pin") { body.currentPin = currentCred; body.newPin = newCred; }
        if (secAction === "change-password") body.newPassword = newCred;
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.status === "success") {
        setSuccess(json.message || "Berhasil diperbarui");
        resetSecState();
        await fetchSettings(false);
        setTimeout(() => setSuccess(""), 3000);
      } else setError(json.message || "Gagal mengubah keamanan");
    } catch {
      setError("Kesalahan jaringan. Butuh koneksi internet.");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePattern = async (pattern: string) => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change-pattern",
          newPattern: pattern,
          currentPattern: hasExistingPattern ? oldPatternInput : undefined,
        }),
      });
      const json = await res.json();
      if (json.status === "success") {
        setSuccess("Pola kunci berhasil disimpan");
        resetSecState();
        await fetchSettings(false);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(json.message || "Gagal menyimpan pola");
        if (json.message?.includes("lama")) {
          setPatternStep("verify-old"); setOldPatternInput(""); setFirstPattern(""); setPatternReady(false);
        } else {
          setPatternStep("draw-first"); setFirstPattern(""); setPatternReady(false);
        }
      }
    } catch {
      setError("Kesalahan jaringan. Butuh koneksi internet.");
      setPatternStep("draw-first"); setFirstPattern(""); setPatternReady(false);
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = () => {
    if (!window.confirm("Hapus Cache Lokal?\n\nDraft yang belum disimpan akan hilang. Data di Google Sheets aman.")) return;
    localStorage.clear(); sessionStorage.clear();
    alert("Cache berhasil dihapus. Halaman akan dimuat ulang.");
    window.location.reload();
  };

  const handleSetupSheet = async () => {
    setSetupLoading(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/settings/setup-sheet", { method: "POST" });
      const json = await res.json();
      if (json.status === "success") {
        setSuccess("Sheet berhasil disetup!");
        setTimeout(() => setSuccess(""), 3000);
      } else setError(json.message || "Gagal setup sheet");
    } catch {
      setError("Koneksi gagal. Pastikan Anda online.");
    } finally {
      setSetupLoading(false);
    }
  };

  const handleCleanDrive = async () => {
    if (!window.confirm("Pindai Drive dan hapus folder yatim piatu? (Pastikan data di Sheets sudah benar)")) return;
    setCleanDriveLoading(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/settings/clean-drive", { method: "POST" });
      const json = await res.json();
      if (json.status === "success") {
        setSuccess(json.message || "Drive berhasil dibersihkan");
      } else setError(json.message || "Gagal membersihkan Drive");
    } catch {
      setError("Koneksi gagal. Pastikan Anda online.");
    } finally {
      setCleanDriveLoading(false);
    }
  };

  if (!isOpen) return null;

  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  const saveLabel =
    secAction === "change-pattern" ? "Simpan Pola" :
    secAction === "change-pin" ? "Simpan PIN" :
    secAction === "change-password" ? "Simpan Sandi" :
    secAction === "change-lock-mode" ? "Simpan Mode" :
    "Simpan";

  const showSaveBtn =
    activeTab === "umum" ||
    (activeTab === "keamanan" && secAction !== "none" && secAction !== "change-pattern") ||
    (activeTab === "keamanan" && secAction === "change-pattern" && patternReady);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center px-4" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-h-[90vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl flex flex-col animate-slide-up overflow-hidden" style={{ maxWidth: "480px" }}>

        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-800 px-6 py-5 shrink-0 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-wide">Pengaturan</h2>
          <button onClick={onClose} className="p-2 -mr-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
              <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
          {(["umum","keamanan","sistem"] as const).map((tab) => (
            <button key={tab} onClick={() => switchTab(tab)}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors border-b-2 capitalize ${activeTab === tab ? "text-brand-600 dark:text-brand-400 border-brand-500" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-transparent"}`}>
              {tab === "umum" ? "Umum" : tab === "keamanan" ? "Keamanan" : "Sistem"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 scrollbar-hide"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}>
          <style>{`
            @keyframes swipeOutLeft { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-32px); } }
            @keyframes swipeOutRight { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(32px); } }
            @keyframes swipeIn { from { opacity:0; transform:translateX(0); } to { opacity:1; transform:translateX(0); } }
          `}</style>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500 font-medium">Memuat data...</p>
            </div>
          ) : (
            <div style={{ animation: swipeDir ? `swipeOut${swipeDir === "left" ? "Left" : "Right"} 0.22s ease forwards` : "swipeIn 0.22s ease forwards" }}>

              {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 mb-4 rounded-xl text-sm font-medium border border-red-200 dark:border-red-800">{error}</div>}
              {success && <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 mb-4 rounded-xl text-sm font-medium border border-green-200 dark:border-green-800">{success}</div>}

              {!isOnline && activeTab !== "sistem" && (
                <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 p-3 mb-4 rounded-xl text-xs font-medium border border-amber-200 dark:border-amber-800 flex gap-2 items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current shrink-0">
                    <path d="M236.4,121.2a12,12,0,0,1-16.8,0A124.08,124.08,0,0,0,128,84a125.75,125.75,0,0,0-58.46,14.33,12,12,0,0,1-11.08-21.31A149.7,149.7,0,0,1,128,60a148.06,148.06,0,0,1,108.4,44.4A12,12,0,0,1,236.4,121.2ZM128,116a92.14,92.14,0,0,0-63.56,25.32,12,12,0,1,0,16.63,17.3A68.1,68.1,0,0,1,128,140a68.1,68.1,0,0,1,46.93,18.62,12,12,0,1,0,16.63-17.3A92.14,92.14,0,0,0,128,116Zm-28.28,68.28A40,40,0,1,1,128,212,40,40,0,0,1,99.72,184.28Z" />
                  </svg>
                  Mode Offline — perubahan keamanan butuh koneksi internet.
                </div>
              )}

              {/* ══════════════ TAB UMUM ══════════════ */}
              {activeTab === "umum" && (
                <form id="settings-umum" onSubmit={handleSaveUmum} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Nama Usaha</label>
                    <input type="text" value={settings.namaUsaha || ""} onChange={(e) => setSettings({ ...settings, namaUsaha: e.target.value })}
                      className="input-field" placeholder="Contoh: Sunan Motor" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Nama Pemilik</label>
                    <input type="text" value={settings.namaPemilik || ""} onChange={(e) => setSettings({ ...settings, namaPemilik: e.target.value })}
                      className="input-field" placeholder="Masukkan nama pemilik" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Nomor WhatsApp</label>
                    <input type="text" value={settings.nomorWa || ""} onChange={(e) => setSettings({ ...settings, nomorWa: e.target.value })}
                      className="input-field" placeholder="Contoh: 08123456789" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Catatan/Motto Sambutan</label>
                    <textarea value={settings.catatanWelcome || ""} onChange={(e) => setSettings({ ...settings, catatanWelcome: e.target.value })}
                      rows={3} className="input-field resize-none leading-relaxed"
                      placeholder="Bismillah, lancar jaya berkah barokah..." />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Modal Awal Usaha</label>
                    <div className="currency-wrapper">
                      <span className="currency-prefix">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={settings.modalAwal != null && settings.modalAwal !== 0 ? Number(settings.modalAwal).toLocaleString("id-ID") : ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, "").replace(/[^0-9]/g, "");
                          setSettings({ ...settings, modalAwal: raw ? Number(raw) : 0 });
                        }}
                        className="input-field with-prefix"
                        placeholder="0"
                      />
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-1">Modal awal akan ditambahkan ke saldo. Berguna jika usaha dimulai dengan modal kas.</p>
                  </div>
                </form>
              )}

              {/* ══════════════ TAB KEAMANAN ══════════════ */}
              {activeTab === "keamanan" && (
                <div className="space-y-4">

                  {/* Menu utama */}
                  {secAction === "none" && (
                    <div className="space-y-2.5">
                      {/* Badge mode aktif */}
                      <div className="flex items-center gap-3 p-3 bg-brand-50 dark:bg-brand-900/20 rounded-xl border border-brand-100 dark:border-brand-800 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-brand-600 dark:fill-brand-400">
                            <path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-48-56a32,32,0,1,1-32-32A32,32,0,0,1,160,152Z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs text-brand-500 dark:text-brand-400 font-semibold uppercase tracking-wide">Mode Kunci Aktif</p>
                          <p className="text-sm font-bold text-brand-800 dark:text-brand-200 uppercase">{settings.lockMode || "PIN"}</p>
                        </div>
                      </div>

                      {[
                        { action: "change-lock-mode" as const, label: "Ubah Mode Kunci", desc: "Pilih PIN, Sandi, atau Pola", iconPath: "M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-48-56a32,32,0,1,1-32-32A32,32,0,0,1,160,152Z", bg: "bg-brand-100 dark:bg-brand-900/30", ic: "fill-brand-600 dark:fill-brand-400" },
                        { action: "change-pin" as const, label: "Ganti PIN", desc: "Ubah kode akses 6 digit", iconPath: "M120,112v48H96V144H80a8,8,0,0,1,0-16H104a8,8,0,0,1,8,8v24h8V112a8,8,0,0,1,16,0Zm56,16a24,24,0,0,1-48,0V112a24,24,0,0,1,48,0Zm-16-16a8,8,0,0,0-16,0v16a8,8,0,0,0,16,0ZM213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z", bg: "bg-blue-100 dark:bg-blue-900/30", ic: "fill-blue-600 dark:fill-blue-400" },
                        { action: "change-password" as const, label: "Ganti Sandi", desc: "Ubah kode akses huruf & angka", iconPath: "M128,88a40,40,0,1,0,40,40A40,40,0,0,0,128,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,152Zm120-24a104,104,0,0,1-208,0,8,8,0,0,1,16,0,88,88,0,0,0,176,0A8,8,0,0,1,248,128ZM96,128a32,32,0,1,1-32-32A32,32,0,0,1,96,128Zm-16,0a16,16,0,1,0-16-16A16,16,0,0,0,80,128Zm144-32a32,32,0,1,0,32,32A32,32,0,0,0,224,96Zm0,48a16,16,0,1,1,16-16A16,16,0,0,1,224,144Z", bg: "bg-purple-100 dark:bg-purple-900/30", ic: "fill-purple-600 dark:fill-purple-400" },
                        { action: "change-pattern" as const, label: "Atur Pola Kunci", desc: "Gambar pola titik sebagai kunci", iconPath: "M200,56a28,28,0,1,0-28,28,28,28,0,0,0,28-28ZM84,128a28,28,0,1,0-28,28A28,28,0,0,0,84,128Zm116,0a28,28,0,1,0-28,28A28,28,0,0,0,200,128ZM84,200a28,28,0,1,0-28,28A28,28,0,0,0,84,200Zm116,0a28,28,0,1,0-28,28A28,28,0,0,0,200,200ZM84,56a28,28,0,1,0-28,28A28,28,0,0,0,84,56Z", bg: "bg-emerald-100 dark:bg-emerald-900/30", ic: "fill-emerald-600 dark:fill-emerald-400" },
                      ].map((item) => (
                        <button key={item.action}
                          onClick={() => {
                            setSecAction(item.action);
                            setCurrentCred(""); setNewCred(""); setConfirmCred("");
                            const initStep = (item.action === "change-pattern" && hasExistingPattern) ? "verify-old" : "draw-first";
                            setPatternStep(initStep);
                            setOldPatternInput(""); setFirstPattern(""); setPatternReady(false);
                            setError(""); setSuccess("");
                          }}
                          className="w-full flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all active:scale-[0.99]">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={`w-[18px] h-[18px] ${item.ic}`}>
                                <path d={item.iconPath} />
                              </svg>
                            </div>
                            <div className="text-left">
                              <p className="font-semibold text-gray-900 dark:text-white text-sm">{item.label}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</p>
                            </div>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-gray-400 shrink-0">
                            <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Ubah Mode Kunci */}
                  {secAction === "change-lock-mode" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { setSecAction("none"); setError(""); }} className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-gray-600 dark:fill-gray-300"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" /></svg>
                        </button>
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm">Ubah Mode Kunci</h3>
                      </div>
                      <form id="settings-security" onSubmit={handleSaveSecurity}>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {(["pin","password","pattern"] as LockMode[]).map((mode) => (
                            <button key={mode} type="button" onClick={() => setSelectedLockMode(mode)}
                              className={`py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-1.5 ${selectedLockMode === mode ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current">
                                {mode === "pin" && <path d="M120,112v48H96V144H80a8,8,0,0,1,0-16H104a8,8,0,0,1,8,8v24h8V112a8,8,0,0,1,16,0Zm56,16a24,24,0,0,1-48,0V112a24,24,0,0,1,48,0Zm-16-16a8,8,0,0,0-16,0v16a8,8,0,0,0,16,0ZM213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" />}
                                {mode === "password" && <path d="M128,88a40,40,0,1,0,40,40A40,40,0,0,0,128,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,152Zm120-24a104,104,0,0,1-208,0,8,8,0,0,1,16,0,88,88,0,0,0,176,0A8,8,0,0,1,248,128Z" />}
                                {mode === "pattern" && <path d="M200,56a28,28,0,1,0-28,28,28,28,0,0,0,28-28ZM84,128a28,28,0,1,0-28,28A28,28,0,0,0,84,128Zm116,0a28,28,0,1,0-28,28A28,28,0,0,0,200,128ZM84,200a28,28,0,1,0-28,28A28,28,0,0,0,84,200Zm116,0a28,28,0,1,0-28,28A28,28,0,0,0,200,200ZM84,56a28,28,0,1,0-28,28A28,28,0,0,0,84,56Z" />}
                              </svg>
                              {mode === "pin" ? "PIN" : mode === "password" ? "Sandi" : "Pola"}
                            </button>
                          ))}
                        </div>
                        {selectedLockMode === "pattern" && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                            ⚠️ Pastikan sudah mengatur pola kunci terlebih dahulu.
                          </p>
                        )}
                      </form>
                    </div>
                  )}

                  {/* Ganti PIN / Sandi */}
                  {(secAction === "change-pin" || secAction === "change-password") && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { setSecAction("none"); setError(""); }} className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-gray-600 dark:fill-gray-300"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" /></svg>
                        </button>
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm">{secAction === "change-pin" ? "Ganti PIN" : "Ganti Sandi"}</h3>
                      </div>
                      <form id="settings-security" onSubmit={handleSaveSecurity} className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{secAction === "change-pin" ? "PIN" : "Sandi"} Lama</label>
                          <input type="password" value={currentCred} onChange={(e) => setCurrentCred(e.target.value)}
                            className="input-field" placeholder={secAction === "change-pin" ? "Masukkan PIN lama" : "Masukkan sandi lama"} required />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{secAction === "change-pin" ? "PIN Baru (6 Angka)" : "Sandi Baru (Min. 4 Karakter)"}</label>
                          <input type={secAction === "change-pin" ? "number" : "text"} value={newCred} onChange={(e) => setNewCred(e.target.value)}
                            maxLength={secAction === "change-pin" ? 6 : 30}
                            className="input-field" placeholder={secAction === "change-pin" ? "Contoh: 123456" : "Sandi baru"} required />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Konfirmasi {secAction === "change-pin" ? "PIN" : "Sandi"} Baru</label>
                          <input type={secAction === "change-pin" ? "number" : "text"} value={confirmCred} onChange={(e) => setConfirmCred(e.target.value)}
                            maxLength={secAction === "change-pin" ? 6 : 30}
                            className="input-field" placeholder="Ketik ulang" required />
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Atur Pola Kunci */}
                  {secAction === "change-pattern" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { setSecAction("none"); setPatternStep("draw-first"); setOldPatternInput(""); setFirstPattern(""); setPatternReady(false); setError(""); }}
                          className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-gray-600 dark:fill-gray-300"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" /></svg>
                        </button>
                        <h3 className="font-bold text-gray-800 dark:text-white text-sm">Atur Pola Kunci</h3>
                      </div>

                      {/* Progress steps */}
                      <div className="flex items-center gap-2 px-1">
                        {hasExistingPattern && (
                          <>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${patternStep !== "verify-old" ? "bg-emerald-500 text-white" : "bg-emerald-500 text-white"}`}>0</div>
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Verifikasi</span>
                            </div>
                            <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${patternStep !== "verify-old" ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"}`} />
                          </>
                        )}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${patternStep === "draw-first" || patternStep === "draw-confirm" || patternReady ? "bg-emerald-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-400"}`}>1</div>
                          <span className={`text-xs font-semibold transition-colors ${patternStep === "draw-first" || patternStep === "draw-confirm" || patternReady ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>Gambar</span>
                        </div>
                        <div className={`flex-1 h-1 rounded-full transition-all duration-500 ${patternStep === "draw-confirm" || patternReady ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"}`} />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${patternStep === "draw-confirm" || patternReady ? "bg-emerald-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-400"}`}>2</div>
                          <span className={`text-xs font-semibold transition-colors duration-300 ${patternStep === "draw-confirm" || patternReady ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>Konfirmasi</span>
                        </div>
                      </div>

                      {/* Step 0: Verifikasi pola lama */}
                      {patternStep === "verify-old" && (
                        <>
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-amber-500 shrink-0 mt-0.5"><path d="M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z" /></svg>
                            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">Gambar pola kunci yang sedang aktif untuk verifikasi identitas.</p>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col items-center gap-2">
                            <PatternLock key="verify-old" title="" subtitle="" showCancel={false} theme="light"
                              onComplete={(pattern) => { setOldPatternInput(pattern); setPatternStep("draw-first"); setError(""); }} />
                            <p className="text-xs text-gray-400 dark:text-gray-500">Gambar pola lama Anda</p>
                          </div>
                        </>
                      )}

                      {/* Step 1 & 2: Gambar pola baru + konfirmasi */}
                      {(patternStep === "draw-first" || patternStep === "draw-confirm") && !patternReady && (
                        <>
                          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-emerald-500 shrink-0 mt-0.5"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z" /></svg>
                            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed">
                              {patternStep === "draw-first" ? "Hubungkan minimal 4 titik untuk membuat pola baru." : "Gambar ulang pola yang sama persis untuk konfirmasi."}
                            </p>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col items-center gap-2">
                            <PatternLock key={patternStep} title="" subtitle="" showCancel={false} theme="light"
                              onComplete={(pattern) => {
                                if (patternStep === "draw-first") {
                                  setFirstPattern(pattern);
                                  setPatternStep("draw-confirm");
                                  setError("");
                                } else {
                                  if (pattern === firstPattern) {
                                    setPatternReady(true);
                                    setError("");
                                  } else {
                                    setError("Pola tidak cocok. Ulangi dari langkah 1.");
                                    setPatternStep("draw-first");
                                    setFirstPattern("");
                                  }
                                }
                              }} />
                            <p className="text-xs text-gray-400 dark:text-gray-500">{patternStep === "draw-first" ? "Langkah 1 dari 2 — buat pola baru" : "Langkah 2 dari 2 — konfirmasi pola"}</p>
                          </div>
                        </>
                      )}

                      {/* Step done: siap simpan */}
                      {patternReady && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border-2 border-emerald-400 dark:border-emerald-600 p-5 flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-7 h-7 fill-emerald-500"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z" /></svg>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">Pola Cocok!</p>
                            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Klik <strong>Simpan Pola</strong> di bawah untuk menyimpan.</p>
                          </div>
                          <button type="button" onClick={() => { setPatternStep("draw-first"); setFirstPattern(""); setPatternReady(false); setError(""); }}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline transition-colors">Gambar ulang</button>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

              {/* ══════════════ TAB SISTEM ══════════════ */}
              {activeTab === "sistem" && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border ${isOnline ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isOnline ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"}`}>
                        {isOnline
                          ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z" /></svg>
                          : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current"><path d="M236.4,121.2a12,12,0,0,1-16.8,0A124.08,124.08,0,0,0,128,84a125.75,125.75,0,0,0-58.46,14.33,12,12,0,0,1-11.08-21.31A149.7,149.7,0,0,1,128,60a148.06,148.06,0,0,1,108.4,44.4A12,12,0,0,1,236.4,121.2ZM128,116a92.14,92.14,0,0,0-63.56,25.32,12,12,0,1,0,16.63,17.3A68.1,68.1,0,0,1,128,140a68.1,68.1,0,0,1,46.93,18.62,12,12,0,1,0,16.63-17.3A92.14,92.14,0,0,0,128,116Zm-28.28,68.28A40,40,0,1,1,128,212,40,40,0,0,1,99.72,184.28Z" /></svg>
                        }
                      </div>
                      <div>
                        <h3 className={`font-bold text-sm ${isOnline ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}`}>{isOnline ? "Terhubung ke Internet" : "Mode Offline Aktif"}</h3>
                        <p className={`text-xs mt-0.5 ${isOnline ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>{isOnline ? "Database tersinkronisasi" : "Data baru akan disimpan ke antrean offline."}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-2xl border border-red-100 dark:border-red-900/30">
                    <h3 className="font-bold text-red-800 dark:text-red-300 text-sm mb-1">Hapus Cache Lokal</h3>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mb-3 leading-relaxed">Jika aplikasi bermasalah, hapus cache. Draft yang belum disimpan mungkin hilang.</p>
                    <button type="button" onClick={handleClearCache}
                      className="w-full py-2.5 px-4 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" /></svg>
                      Bersihkan Cache
                    </button>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                    <h3 className="font-bold text-amber-800 dark:text-amber-300 text-sm mb-1">Bersihkan Drive</h3>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mb-3 leading-relaxed">Pindahkan folder yatim piatu di Google Drive ke folder HAPUS.</p>
                    <button type="button" onClick={handleCleanDrive} disabled={cleanDriveLoading}
                      className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white transition-colors rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                      {cleanDriveLoading
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memindai...</>
                        : <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM216,56V76.69L133.66,159a8,8,0,0,1-11.32,0L40,76.69V56ZM40,99.31l72,72a24,24,0,0,0,33.94,0l72-72V200H40Z" /></svg>Bersihkan Drive</>
                      }
                    </button>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                    <h3 className="font-bold text-blue-800 dark:text-blue-300 text-sm mb-1">Setup Google Sheets</h3>
                    <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mb-3 leading-relaxed">Buat semua sheet yang diperlukan dengan header yang sudah diformat.</p>
                    <button type="button" onClick={handleSetupSheet} disabled={setupLoading}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white transition-colors rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                      {setupLoading
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyiapkan...</>
                        : <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" /></svg>Setup Sheet Sekarang</>
                      }
                    </button>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1">Muat Ulang Pengaturan</h3>
                    <p className="text-xs text-gray-500 mb-3">Sinkronkan pengaturan terbaru dari Google Sheets.</p>
                    <button type="button" onClick={() => fetchSettings(false)}
                      className="w-full py-2.5 px-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white text-sm font-semibold rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current"><path d="M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,194.27a8,8,0,1,1,11.08-11.54,79.52,79.52,0,0,0,54.91,25.26c.3,0,.61,0,.91,0A80,80,0,0,0,208,128a8,8,0,0,1,16,0ZM127.09,32A79.52,79.52,0,0,0,72.18,57.27a8,8,0,1,0,11.08,11.54A63.55,63.55,0,0,1,127.09,48a64,64,0,0,1,64,64,8,8,0,0,0,16,0A80.09,80.09,0,0,0,127.09,32ZM72,128a8,8,0,0,0-8-8H24a8,8,0,0,0,0,16H64A8,8,0,0,0,72,128Zm160-8h-8a8,8,0,0,0,0,16h8a8,8,0,0,0,0-16Z" /></svg>
                      Muat Ulang
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-800 px-5 py-4 shrink-0 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 rounded-b-3xl">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm">
            Tutup
          </button>
          {showSaveBtn && (
            <button
              type={secAction === "change-pattern" ? "button" : "submit"}
              form={activeTab === "umum" ? "settings-umum" : secAction !== "change-pattern" ? "settings-security" : undefined}
              onClick={secAction === "change-pattern" && patternReady ? () => handleSavePattern(firstPattern) : undefined}
              disabled={saving || loading || (secAction === "change-pattern" && !patternReady)}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-brand-500/25 transition-all flex items-center gap-2 text-sm">
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{saveLabel}...</>
                : <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-white"><path d="M219.31,72,184,36.69A15.86,15.86,0,0,0,172.69,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V83.31A15.86,15.86,0,0,0,219.31,72ZM168,208H88V152h80Zm40,0H184V152a16,16,0,0,0-16-16H88a16,16,0,0,0-16,16v56H48V48H172.69L208,83.31ZM160,72a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h40A8,8,0,0,1,160,72Z" /></svg>{saveLabel}</>
              }
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
