"use client";

/**
 * useOfflineSync — Hook untuk mengelola status online/offline dan sync
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { syncQueueCount } from "@/lib/offlineDB";
import { runSync, type SyncProgress } from "@/lib/syncEngine";

export interface OfflineSyncState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  progress: SyncProgress | null;
  lastSyncAt: number | null;
  triggerSync: () => Promise<void>;
  dismissProgress: () => void;
}

const INITIAL_PROGRESS: SyncProgress = {
  total: 0, done: 0, current: "", percent: 0, phase: "idle", errors: [],
};

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const syncLockRef = useRef(false);

  // Cek status online
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Cek pending count secara berkala
  const checkPending = useCallback(async () => {
    const count = await syncQueueCount();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    checkPending();
    const interval = setInterval(checkPending, 10_000);
    return () => clearInterval(interval);
  }, [checkPending]);

  // Auto-sync saat kembali online
  useEffect(() => {
    if (!isOnline) return;
    // Delay sedikit agar koneksi stabil
    const t = setTimeout(() => {
      checkPending().then(async () => {
        const count = await syncQueueCount();
        if (count > 0) triggerSync();
      });
    }, 2000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const triggerSync = useCallback(async () => {
    if (syncLockRef.current || !navigator.onLine) return;
    syncLockRef.current = true;
    setIsSyncing(true);
    setProgress({ ...INITIAL_PROGRESS, phase: "syncing", current: "Memulai sinkronisasi..." });

    try {
      const result = await runSync((p) => setProgress({ ...p }));
      setProgress({ ...result });
      setLastSyncAt(Date.now());
      await checkPending();

      // Auto-dismiss setelah 4 detik jika sukses
      if (result.phase === "done") {
        setTimeout(() => setProgress(null), 4000);
      }
    } catch (err) {
      setProgress({
        ...INITIAL_PROGRESS,
        phase: "error",
        current: err instanceof Error ? err.message : "Sync gagal",
        errors: [err instanceof Error ? err.message : "Unknown error"],
      });
    } finally {
      setIsSyncing(false);
      syncLockRef.current = false;
    }
  }, [checkPending]);

  const dismissProgress = useCallback(() => setProgress(null), []);

  return { isOnline, pendingCount, isSyncing, progress, lastSyncAt, triggerSync, dismissProgress };
}
