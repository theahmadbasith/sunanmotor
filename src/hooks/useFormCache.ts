"use client";

/**
 * useFormCache - Simpan & restore data form ke IndexedDB
 * Agar data tidak hilang saat pindah tab atau refresh
 */

import { useEffect, useCallback, useRef } from "react";

const DB_NAME = "sunantrack_cache";
const DB_VERSION = 1;
const STORE_NAME = "form_drafts";

// Buka koneksi IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Simpan data ke IndexedDB
async function saveToIDB(key: string, data: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, data, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silent fail — IndexedDB tidak tersedia (SSR, private mode, dll)
  }
}

// Baca data dari IndexedDB
async function loadFromIDB<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result?.data ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// Hapus data dari IndexedDB
async function clearFromIDB(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silent fail
  }
}

// ============================================================
// HOOK UTAMA
// ============================================================

interface UseFormCacheOptions<T> {
  /** Key unik untuk form ini di IndexedDB */
  cacheKey: string;
  /** Data form saat ini */
  data: T;
  /** Callback saat data cache berhasil dimuat */
  onRestore: (data: T) => void;
  /** Delay debounce sebelum simpan (ms), default 800 */
  debounceMs?: number;
}

export function useFormCache<T>({
  cacheKey,
  data,
  onRestore,
  debounceMs = 800,
}: UseFormCacheOptions<T>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);

  // Load cache saat mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    loadFromIDB<T>(cacheKey).then((cached) => {
      if (cached) {
        onRestore(cached);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Auto-save dengan debounce setiap kali data berubah
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveToIDB(cacheKey, data);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cacheKey, data, debounceMs]);

  // Fungsi untuk hapus cache (dipanggil setelah submit berhasil)
  const clearCache = useCallback(() => {
    clearFromIDB(cacheKey);
  }, [cacheKey]);

  return { clearCache };
}
