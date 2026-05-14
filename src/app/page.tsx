"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import LockScreen from "@/components/LockScreen";
import DashboardView from "@/components/views/DashboardView";
import BeliMotorView from "@/components/views/BeliMotorView";
import AddMotorView from "@/components/views/AddMotorView";
import TarikView from "@/components/views/TarikView";
import HistoryView from "@/components/views/HistoryView";
import OfflineIndicator from "@/components/OfflineIndicator";
import SyncProgressModal from "@/components/modals/SyncProgressModal";
import ReportsModal from "@/components/modals/ReportsModal";
import { useInitBackButton } from "@/hooks/useBackButton";
import { useOfflineSync } from "@/hooks/useOfflineSync";

type TabName = "dashboard" | "beli" | "add-motor" | "pengeluaran" | "history";

const TAB_ORDER: TabName[] = ["beli", "add-motor", "dashboard", "pengeluaran", "history"];

export default function HomePage() {
  const [pinVerified, setPinVerified] = useState(false);
  const [pinChecked, setPinChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentSaldo, setCurrentSaldo] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [historyInitialTab, setHistoryInitialTab] = useState<"jual" | "beli" | "pengeluaran">("jual");
  const [lanjutJualData, setLanjutJualData] = useState<{
    namaMotor: string; hargaBeli: number; idBeli: string; detailRestorasi?: import("@/types").DetailRestorasi[]; biayaRestorasi?: number;
  } | undefined>(undefined);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [photoViewerActive, setPhotoViewerActive] = useState(false);

  const { isOnline, pendingCount, isSyncing, progress, triggerSync, dismissProgress } = useOfflineSync();

  const swipeTouchStartX = useRef<number | null>(null);
  const swipeTouchStartY = useRef<number | null>(null);
  const swipeStartTab = useRef<TabName>("dashboard");

  // Inisialisasi sistem back button sekali saja
  useInitBackButton();

  useEffect(() => {
    const verified = sessionStorage.getItem("pin_verified") === "1";
    setPinVerified(verified);
    setPinChecked(true);
  }, []);

  useEffect(() => {
    const handler = () => triggerSync();
    window.addEventListener("sw-sync-trigger", handler);
    return () => window.removeEventListener("sw-sync-trigger", handler);
  }, [triggerSync]);

  // Listen PhotoViewer open/close untuk disable swipe menu
  useEffect(() => {
    const onOpen = () => setPhotoViewerActive(true);
    const onClose = () => setPhotoViewerActive(false);
    window.addEventListener("photoviewer-open", onOpen);
    window.addEventListener("photoviewer-close", onClose);
    return () => {
      window.removeEventListener("photoviewer-open", onOpen);
      window.removeEventListener("photoviewer-close", onClose);
    };
  }, []);

  const fetchSaldo = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json.status === "success") setCurrentSaldo(json.data.saldo);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (pinVerified) fetchSaldo();
  }, [fetchSaldo, refreshKey, pinVerified]);

  const handleTabChange = (tab: TabName, historyTab?: "jual" | "beli" | "pengeluaran") => {
    if (tab === "add-motor") setLanjutJualData(undefined);
    if (tab === "pengeluaran") fetchSaldo();
    if (tab === "history" && historyTab) setHistoryInitialTab(historyTab);
    setActiveTab(tab);
  };

  const handleLanjutJual = (data: { namaMotor: string; hargaBeli: number; idBeli: string; detailRestorasi?: import("@/types").DetailRestorasi[]; biayaRestorasi?: number }) => {
    setLanjutJualData(data);
    setActiveTab("add-motor");
  };

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setShowSuccess(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setShowSuccess(false), 2200);
  };

  // Swipe navigasi antar menu — dinonaktifkan saat PhotoViewer aktif
  const handleMainTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("nav")) return;
    if (photoViewerActive) return;
    swipeTouchStartX.current = e.touches[0].clientX;
    swipeTouchStartY.current = e.touches[0].clientY;
    swipeStartTab.current = activeTab;
  }, [activeTab, photoViewerActive]);

  const handleMainTouchEnd = useCallback((e: React.TouchEvent) => {
    if (photoViewerActive) return;
    if (swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;

    const dx = swipeTouchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeTouchStartY.current);

    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;

    if (Math.abs(dx) < 60 || Math.abs(dx) <= dy * 1.5) return;

    const currentIdx = TAB_ORDER.indexOf(swipeStartTab.current);
    if (currentIdx === -1) return;
    if (swipeStartTab.current === "history") return; // HistoryView handle sendiri

    if (dx > 0 && currentIdx < TAB_ORDER.length - 1) {
      handleTabChange(TAB_ORDER[currentIdx + 1]);
    } else if (dx < 0 && currentIdx > 0) {
      handleTabChange(TAB_ORDER[currentIdx - 1]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoViewerActive, activeTab]);

  if (!pinChecked) return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #312e81 0%, #4338ca 50%, #1e3a8a 100%)" }}>
      <div className="w-8 h-8 rounded-full animate-spin" style={{ borderWidth: "3px", borderStyle: "solid", borderColor: "rgba(255,255,255,0.25)", borderTopColor: "white" }} />
    </div>
  );

  if (!pinVerified) return <LockScreen onSuccess={() => setPinVerified(true)} />;

  return (
    <>
      <div
        className="app-shell animate-app-enter"
        onTouchStart={handleMainTouchStart}
        onTouchEnd={handleMainTouchEnd}
      >
        <OfflineIndicator isOnline={isOnline} pendingCount={pendingCount} isSyncing={isSyncing} onSyncNow={triggerSync} />
        <Header />
        <main className="app-main scrollbar-hide pb-24">
          {activeTab === "dashboard" && (
            <DashboardView
              onNavigate={(tab, historyTab) => handleTabChange(tab as TabName, historyTab)}
              refreshKey={refreshKey}
              onLanjutJual={handleLanjutJual}
            />
          )}
          {activeTab === "history" && (
            <HistoryView
              refreshKey={refreshKey}
              onLanjutJual={handleLanjutJual}
              initialTab={historyInitialTab}
              onSwipeOutLeft={() => { /* tidak ada menu setelah history */ }}
              onSwipeOutRight={() => handleTabChange("pengeluaran")}
            />
          )}
          {activeTab === "beli" && (
            <BeliMotorView onSuccess={() => { setActiveTab("dashboard"); showToast("Pembelian motor berhasil dicatat!"); }} />
          )}
          {activeTab === "add-motor" && (
            <AddMotorView
              onSuccess={() => { setActiveTab("dashboard"); setLanjutJualData(undefined); showToast("Data penjualan berhasil disimpan!"); }}
              prefillData={lanjutJualData ? {
                namaMotor: lanjutJualData.namaMotor,
                hargaBeli: lanjutJualData.hargaBeli,
                idBeli: lanjutJualData.idBeli,
                biayaReparasi: lanjutJualData.biayaRestorasi || 0,
                detailRestorasi: lanjutJualData.detailRestorasi,
              } : undefined}
            />
          )}
          {activeTab === "pengeluaran" && (
            <TarikView
              currentSaldo={currentSaldo}
              onSuccess={() => { setActiveTab("dashboard"); showToast("Pengeluaran berhasil dicatat!"); }}
            />
          )}
        </main>
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </div>

      <SyncProgressModal progress={progress} onDismiss={dismissProgress} />
      <ReportsModal isOpen={reportsOpen} onClose={() => setReportsOpen(false)} />

      {showSuccess && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[99998] bg-green-600 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold flex items-center gap-2 animate-slide-up"
          style={{ maxWidth: "calc(480px - 2rem)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white shrink-0">
            <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z" />
          </svg>
          {successMsg}
        </div>
      )}
    </>
  );
}
