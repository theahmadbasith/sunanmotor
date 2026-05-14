"use client";

/**
 * useBackButton — Sistem back button terpusat berbasis stack
 *
 * Satu listener global. Setiap modal mendaftarkan handler ke stack.
 * Back button / Esc selalu memanggil handler paling atas di stack.
 * Jika stack kosong, tidak ada aksi (browser menangani sendiri).
 */

import { useEffect, useRef, useCallback } from "react";

type BackHandler = () => void;

// Stack global — satu instance untuk seluruh app
const _stack: BackHandler[] = [];
let _initialized = false;

function initGlobalListener() {
  if (_initialized || typeof window === "undefined") return;
  _initialized = true;

  // Satu state penjaga agar popstate bisa ditrigger
  window.history.pushState({ backGuard: true }, "");

  window.addEventListener("popstate", () => {
    // Push ulang state penjaga agar back berikutnya masih bisa ditangkap
    window.history.pushState({ backGuard: true }, "");

    if (_stack.length > 0) {
      const handler = _stack.pop();
      handler?.();
    }
    // Stack kosong → biarkan browser/OS menangani (tidak ada aksi dari app)
  });

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (_stack.length > 0) {
      e.preventDefault();
      const handler = _stack.pop();
      handler?.();
    }
  });
}

/**
 * Inisialisasi sistem — dipanggil sekali dari root app (page.tsx)
 */
export function useInitBackButton() {
  useEffect(() => {
    initGlobalListener();
  }, []);
}

/**
 * Daftarkan back handler dari modal/layer.
 * enabled=true  → handler masuk stack
 * enabled=false → handler keluar stack
 */
export function useBackButton(enabled: boolean, onBack: BackHandler) {
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  const stableHandler = useCallback(() => onBackRef.current(), []);

  useEffect(() => {
    if (!enabled) return;
    _stack.push(stableHandler);
    return () => {
      const idx = _stack.lastIndexOf(stableHandler);
      if (idx !== -1) _stack.splice(idx, 1);
    };
  }, [enabled, stableHandler]);
}
