"use client";

/**
 * PhotoViewer — Lightbox fullscreen dengan swipe, zoom pinch, navigasi, dan hapus foto
 * Dirender via React Portal ke document.body agar tidak terpotong oleh overflow:hidden parent
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useBackButton } from "@/hooks/useBackButton";

interface PhotoViewerProps {
  photos: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  motorName?: string;
  onDelete?: (index: number) => void;
}

export default function PhotoViewer({
  photos,
  initialIndex = 0,
  isOpen,
  onClose,
  motorName,
  onDelete,
}: PhotoViewerProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imgError, setImgError] = useState(false);

  const lastTouchDist = useRef<number | null>(null);
  const lastTouchMidpoint = useRef<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const lastTap = useRef(0);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  useEffect(() => {
    if (isOpen) {
      const idx = Math.min(Math.max(initialIndex, 0), Math.max(photos.length - 1, 0));
      setCurrent(idx);
      resetZoom();
      setImgError(false);
    }
  }, [isOpen, initialIndex, photos.length]);

  useEffect(() => {
    resetZoom();
    setImgError(false);
  }, [current]);

  // Adjust current index when photos array shrinks after deletion
  useEffect(() => {
    if (isOpen && photos.length > 0 && current >= photos.length) {
      setCurrent(photos.length - 1);
    }
    if (isOpen && photos.length === 0) {
      onClose();
    }
  }, [photos.length, current, isOpen, onClose]);

  // Lock body scroll — kritis agar fixed positioning bekerja benar di mobile
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const scrollY = window.scrollY;

    // Freeze body di posisi scroll saat ini
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    // Beritahu parent bahwa PhotoViewer aktif (disable swipe menu)
    window.dispatchEvent(new Event("photoviewer-open"));

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
      // Beritahu parent bahwa PhotoViewer sudah ditutup
      window.dispatchEvent(new Event("photoviewer-close"));
    };
  }, [isOpen]);

  // Back button & Esc — tutup PhotoViewer
  useBackButton(isOpen, onClose);

  // Arrow keys untuk navigasi foto di desktop
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, current]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    dragOffset.current = { x: 0, y: 0 };
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  }, []);

  const prev = useCallback(() => {
    if (current > 0) setCurrent((c) => c - 1);
  }, [current]);

  const next = useCallback(() => {
    if (current < photos.length - 1) setCurrent((c) => c + 1);
  }, [current, photos.length]);

  const getTouchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchMidpoint = (touches: React.TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastTouchDist.current = getTouchDist(e.touches);
      lastTouchMidpoint.current = getTouchMidpoint(e.touches);
      swipeStartX.current = null;
    } else if (e.touches.length === 1) {
      swipeStartX.current = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
      dragStart.current = {
        x: e.touches[0].clientX - dragOffset.current.x,
        y: e.touches[0].clientY - dragOffset.current.y,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const newDist = getTouchDist(e.touches);
      const delta = newDist / lastTouchDist.current;
      const newScale = Math.min(Math.max(scaleRef.current * delta, 1), 6);
      setScale(newScale);
      scaleRef.current = newScale;
      lastTouchDist.current = newDist;
    } else if (e.touches.length === 1) {
      if (scaleRef.current > 1 && dragStart.current) {
        const nx = e.touches[0].clientX - dragStart.current.x;
        const ny = e.touches[0].clientY - dragStart.current.y;
        dragOffset.current = { x: nx, y: ny };
        setOffset({ x: nx, y: ny });
        setIsDragging(true);
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    lastTouchDist.current = null;
    lastTouchMidpoint.current = null;

    if (scaleRef.current <= 1 && swipeStartX.current !== null && !isDragging) {
      const endX = e.changedTouches[0]?.clientX ?? 0;
      const endY = e.changedTouches[0]?.clientY ?? 0;
      const dx = endX - (swipeStartX.current ?? endX);
      const dy = endY - (swipeStartY.current ?? endY);
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) next();
        else prev();
      }
    }

    swipeStartX.current = null;
    swipeStartY.current = null;
    dragStart.current = null;
    setIsDragging(false);
  }, [isDragging, next, prev]);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (scaleRef.current > 1) resetZoom();
      else { setScale(2.5); scaleRef.current = 2.5; }
    }
    lastTap.current = now;
  }, [resetZoom]);



  if (!isOpen || photos.length === 0) return null;

  const safeIndex = Math.min(current, photos.length - 1);
  const currentPhoto = photos[safeIndex];

  const content = (
    <div
      className="fixed bg-black flex flex-col select-none"
      style={{
        touchAction: "none",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        width: "100%",
        height: "100%",
      }}
    >
      {/* ── TOP BAR — selalu fixed di atas ── */}
      <div
        className="shrink-0 flex items-center justify-between px-3 bg-black/80 backdrop-blur-md z-10"
        style={{
          paddingTop: `calc(0.75rem + env(safe-area-inset-top))`,
          paddingBottom: "0.75rem",
          minHeight: "56px",
        }}
      >
        {/* Tombol Kembali */}
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center shrink-0 active:bg-white/25 transition-colors"
          aria-label="Tutup"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
            <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
          </svg>
        </button>

        {/* Info tengah */}
        <div className="flex-1 text-center px-2 min-w-0">
          {motorName && (
            <p className="text-white text-xs font-semibold truncate">{motorName}</p>
          )}
          <p className="text-white/60 text-xs">{safeIndex + 1} / {photos.length}</p>
        </div>

        {/* Tombol kanan */}
        <div className="flex items-center gap-2 shrink-0">
          {scale > 1 && (
            <button
              type="button"
              onClick={resetZoom}
              className="px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-white text-xs font-medium active:bg-white/25 transition-colors"
            >
              Reset
            </button>
          )}
          {onDelete && scale <= 1 && (
            <button
              type="button"
              onClick={() => onDelete(safeIndex)}
              className="w-10 h-10 rounded-full bg-red-500/80 border border-red-400/50 flex items-center justify-center active:bg-red-600/80 transition-colors"
              aria-label="Hapus foto"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-white">
                <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
              </svg>
            </button>
          )}
          {!onDelete && scale <= 1 && <div className="w-10" />}
        </div>
      </div>

      {/* ── AREA FOTO — mengisi sisa ruang ── */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative bg-black"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleDoubleTap}
      >
        {imgError ? (
          <div className="flex flex-col items-center gap-3 text-white/50">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-16 h-16 fill-white/20">
              <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,200V172l52-52,44,44,20-20,52,52H40Z" />
            </svg>
            <p className="text-sm">Gagal memuat foto</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={safeIndex}
            src={currentPhoto}
            alt={`Foto ${safeIndex + 1}`}
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transition: isDragging ? "none" : "transform 0.15s ease",
              userSelect: "none",
              WebkitUserSelect: "none",
              willChange: "transform",
            }}
            draggable={false}
            onError={() => setImgError(true)}
            onLoad={() => setImgError(false)}
          />
        )}

        {/* Panah navigasi desktop */}
        {safeIndex > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm items-center justify-center hidden sm:flex active:bg-black/70 transition-colors"
            aria-label="Sebelumnya"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
              <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
            </svg>
          </button>
        )}
        {safeIndex < photos.length - 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm items-center justify-center hidden sm:flex active:bg-black/70 transition-colors"
            aria-label="Berikutnya"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
              <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
            </svg>
          </button>
        )}
      </div>

      {/* ── BOTTOM BAR — selalu fixed di bawah ── */}
      <div
        className="shrink-0 bg-black/80 backdrop-blur-md z-10"
        style={{
          paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom))`,
          paddingTop: "0.75rem",
        }}
      >
        {photos.length > 1 && (
          <div className="flex gap-2 justify-center px-4 mb-2 overflow-x-auto scrollbar-hide">
            {photos.map((url, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => { e.stopPropagation(); setCurrent(idx); }}
                className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === safeIndex ? "border-white scale-110" : "border-white/30 opacity-60"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        )}
        {scale <= 1 && (
          <p className="text-center text-white/40 text-[10px]">
            {photos.length > 1 ? "Geser kiri/kanan • " : ""}Double tap untuk zoom
          </p>
        )}
      </div>

      {/* ── KONFIRMASI HAPUS — ditangani oleh parent via portal ── */}
    </div>
  );

  // Render via portal ke document.body agar tidak terpotong overflow:hidden app-shell
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
