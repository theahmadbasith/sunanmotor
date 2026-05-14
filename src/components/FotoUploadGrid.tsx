"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import CameraOverlay from "@/components/CameraOverlay";
import PhotoViewer from "@/components/PhotoViewer";
import { processAndCompressImage } from "@/lib/utils";
import type { FotoUpload } from "@/types";

interface FotoSlot {
  id: string;
  foto?: FotoUpload;
  loading: boolean;
  error?: boolean;
}

interface FotoUploadGridProps {
  slots: FotoSlot[];
  onSlotsChange: (slots: FotoSlot[] | ((prev: FotoSlot[]) => FotoSlot[])) => void;
  maxImages?: number;
  motorName?: string;
  label?: string;
  emptyText?: string;
}

export type { FotoSlot };

export default function FotoUploadGrid({
  slots,
  onSlotsChange,
  maxImages = 5,
  motorName = "",
  label = "Foto Motor",
  emptyText = "Belum ada foto. Foto pertama = thumbnail utama.",
}: FotoUploadGridProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Touch drag state
  const touchDragIdx = useRef<number | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef<number>(0);
  const touchMoved = useRef(false);
  const touchDragOverIdx = useRef<number | null>(null);
  const [touchDragActive, setTouchDragActive] = useState(false);
  const [touchDragOverDisplay, setTouchDragOverDisplay] = useState<number | null>(null);

  const isCompressing = slots.some((s) => s.loading);
  const doneSlots = slots.filter((s) => s.foto);
  const fotos = doneSlots.map((s) => s.foto!);

  // Ref untuk doneSlots terbaru — dipakai di handleViewerDelete agar tidak stale closure
  const doneSlotsRef = useRef(doneSlots);
  useEffect(() => { doneSlotsRef.current = doneSlots; }, [doneSlots]);

  // ---- Process file from gallery ----
  const processFile = async (file: File, slotId: string) => {
    console.log(`[FotoGrid] Processing: ${file.name}, type: ${file.type}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    
    try {
      // Check file size first
      if (file.size > 25 * 1024 * 1024) {
        onSlotsChange((prev: FotoSlot[]) => prev.filter((s) => s.id !== slotId));
        alert(`File "${file.name}" terlalu besar (maks 25MB).`);
        return;
      }
      
      const { processAndCompressImage } = await import("@/lib/utils");
      const compressed = await processAndCompressImage(file, 1280, 500, true);
      
      if (!compressed) {
        console.error(`[FotoGrid] Failed to process: ${file.name}`);
        // Last-resort fallback: if file is not too huge, use raw file
        if (file.size < 8 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = e.target?.result as string;
            onSlotsChange((prev: FotoSlot[]) =>
              prev.map((s) =>
                s.id === slotId
                  ? { id: slotId, foto: { name: file.name, base64 }, loading: false }
                  : s
              )
            );
          };
          reader.readAsDataURL(file);
          return;
        }

        onSlotsChange((prev: FotoSlot[]) =>
          prev.map((s) => (s.id === slotId ? { ...s, loading: false, error: true } : s))
        );
        return;
      }
      
      console.log(`[FotoGrid] Success: ${file.name}, compressed size: ${(compressed.length / 1024).toFixed(0)}KB`);
      
      onSlotsChange((prev: FotoSlot[]) =>
        prev.map((s) =>
          s.id === slotId
            ? { id: slotId, foto: { name: file.name, base64: compressed }, loading: false }
            : s
        )
      );
    } catch (err) {
      console.error(`[FotoGrid] Error processing ${file.name}:`, err);
      onSlotsChange((prev: FotoSlot[]) =>
        prev.map((s) => (s.id === slotId ? { ...s, loading: false, error: true } : s))
      );
    }
  };

  // ---- Gallery ----
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const available = maxImages - slots.length;
    if (available <= 0) return;
    const toProcess = files.slice(0, available);
    const newSlotIds = toProcess.map(() => Math.random().toString(36).slice(2));
    onSlotsChange((prev: FotoSlot[]) => [
      ...prev,
      ...newSlotIds.map((id) => ({ id, loading: true })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await Promise.all(toProcess.map((file, i) => processFile(file, newSlotIds[i])));
  };

  // ---- Camera ----
  const handleCameraCapture = useCallback(
    async (base64: string, fileName: string) => {
      const slotId = Math.random().toString(36).slice(2);
      onSlotsChange((prev: FotoSlot[]) => [...prev, { id: slotId, loading: true }]);
      try {
        const compressed = await processAndCompressImage(base64, 1280, 500, false);
        onSlotsChange((prev: FotoSlot[]) =>
          prev.map((s) =>
            s.id === slotId
              ? { id: slotId, foto: { name: fileName, base64: compressed }, loading: false }
              : s
          )
        );
      } catch {
        // Fallback: save without compression
        onSlotsChange((prev: FotoSlot[]) =>
          prev.map((s) =>
            s.id === slotId
              ? { id: slotId, foto: { name: fileName, base64 }, loading: false }
              : s
          )
        );
      }
    },
    [onSlotsChange]
  );

  // ---- Delete slot dengan konfirmasi ----
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Delete dari thumbnail grid — minta konfirmasi dulu
  const requestDeleteById = (id: string) => setDeleteTargetId(id);

  const confirmDelete = useCallback(() => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    setViewerOpen(false);
    onSlotsChange((prev: FotoSlot[]) => prev.filter((s) => s.id !== id));
  }, [deleteTargetId, onSlotsChange]);

  const cancelDelete = () => setDeleteTargetId(null);

  // Delete dari PhotoViewer — pakai ref agar tidak stale, lalu konfirmasi via modal yang sama
  const handleViewerDelete = useCallback((viewerIdx: number) => {
    const slot = doneSlotsRef.current[viewerIdx];
    if (!slot) return;
    setDeleteTargetId(slot.id);
  }, []);

  const retrySlot = (id: string) => {
    onSlotsChange((prev: FotoSlot[]) => prev.filter((s) => s.id !== id));
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  // ---- Desktop drag reorder ----
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    onSlotsChange((prev: FotoSlot[]) => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(idx, 0, moved);
      return arr;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // ---- Touch drag reorder ----
  const handleTouchStart = useCallback((e: React.TouchEvent, idx: number) => {
    if (slots[idx]?.loading || slots[idx]?.error || !slots[idx]?.foto) return;
    const touch = e.touches[0];
    touchDragIdx.current = idx;
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchStartTime.current = Date.now();
    touchMoved.current = false;
    touchDragOverIdx.current = null;
  }, [slots]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchDragIdx.current === null || !touchStartPos.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 8) {
      touchMoved.current = true;
      if (!touchDragActive) setTouchDragActive(true);
      e.preventDefault();

      // Find which slot we're hovering over
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const thumbEl = el?.closest("[data-slot-idx]");
      if (thumbEl) {
        const overIdx = parseInt(thumbEl.getAttribute("data-slot-idx") || "-1");
        if (overIdx >= 0 && overIdx !== touchDragIdx.current) {
          touchDragOverIdx.current = overIdx;
          setTouchDragOverDisplay(overIdx);
        }
      }
    }
  }, [touchDragActive]);

  const handleTouchEnd = useCallback((e: React.TouchEvent, idx: number) => {
    const elapsed = Date.now() - touchStartTime.current;
    const wasMoved = touchMoved.current;
    const overIdx = touchDragOverIdx.current;
    const fromIdx = touchDragIdx.current;

    // Reset state
    touchDragIdx.current = null;
    touchStartPos.current = null;
    touchMoved.current = false;
    touchDragOverIdx.current = null;
    setTouchDragActive(false);
    setTouchDragOverDisplay(null);

    if (!wasMoved && elapsed < 400) {
      // Tap — open viewer
      if (slots[idx]?.foto) {
        openViewer(idx);
      }
    } else if (wasMoved && fromIdx !== null && overIdx !== null && fromIdx !== overIdx) {
      // Drag reorder
      onSlotsChange((prev: FotoSlot[]) => {
        const arr = [...prev];
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(overIdx, 0, moved);
        return arr;
      });
    }
    // Prevent ghost click
    e.preventDefault();
  }, [slots, onSlotsChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const openViewer = (slotIdx: number) => {
    const slot = slots[slotIdx];
    if (!slot?.foto) return;
    const fotoIdx = doneSlots.findIndex((s) => s.id === slot.id);
    setViewerIndex(Math.max(0, fotoIdx));
    setViewerOpen(true);
  };

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
          <span className="text-xs text-gray-400">
            {doneSlots.length}/{maxImages} · maks 500KB
          </span>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            disabled={slots.length >= maxImages}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              className="w-5 h-5 fill-current shrink-0"
            >
              <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,200V172l52-52,44,44,20-20,52,52H40Z" />
            </svg>
            Pilih dari Galeri
          </button>
          <button
            type="button"
            disabled={slots.length >= maxImages}
            onClick={() => setCameraOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-green-200 bg-green-50 text-green-700 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              className="w-5 h-5 fill-current shrink-0"
            >
              <path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.65-3.56L100.28,48h55.44l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z" />
            </svg>
            Ambil Foto
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Thumbnail grid */}
        {slots.length > 0 && (
          <div className="foto-grid">
            {slots.map((slot, idx) => (
              <div
                key={slot.id}
                data-slot-idx={idx}
                draggable={!slot.loading && !slot.error && !!slot.foto}
                onDragStart={() => !slot.loading && handleDragStart(idx)}
                onDragOver={(e) => !slot.loading && handleDragOver(e, idx)}
                onDrop={(e) => !slot.loading && handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, idx)}
                onTouchMove={handleTouchMove}
                onTouchEnd={(e) => handleTouchEnd(e, idx)}
                className={`foto-thumb-item select-none ${
                  (dragOverIdx === idx && dragIdx !== idx) ||
                  (touchDragOverDisplay === idx && touchDragIdx.current !== idx)
                    ? "foto-thumb-dragover"
                    : ""
                } ${
                  (dragIdx === idx || (touchDragActive && touchDragIdx.current === idx))
                    ? "opacity-40"
                    : ""
                }`}
                style={{ transition: "opacity 0.15s" }}
              >
                {slot.loading ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 gap-1.5">
                    <div className="w-6 h-6 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
                    <span className="text-[9px] text-gray-500 font-medium">Proses...</span>
                  </div>
                ) : slot.error ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/20 gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 256 256"
                      className="w-6 h-6 fill-red-400"
                    >
                      <path d="M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z" />
                    </svg>
                    <button
                      type="button"
                      onClick={() => retrySlot(slot.id)}
                      className="text-[9px] text-red-600 font-bold underline"
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : slot.foto ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={slot.foto.base64}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-full object-cover pointer-events-none"
                      draggable={false}
                    />
                    {idx === 0 && (
                      <span className="absolute bottom-1 left-1 bg-brand-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none pointer-events-none">
                        Utama
                      </span>
                    )}
                    <span className="absolute top-1 left-1 text-white/80 drop-shadow pointer-events-none">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 256 256"
                        className="w-3.5 h-3.5 fill-current"
                      >
                        <path d="M104,60a12,12,0,1,1,12,12A12,12,0,0,1,104,60Zm12,52a12,12,0,1,0,12,12A12,12,0,0,0,116,112Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,116,176ZM152,72a12,12,0,1,0-12-12A12,12,0,0,0,152,72Zm0,52a12,12,0,1,0,12,12A12,12,0,0,0,152,124Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,152,188Z" />
                      </svg>
                    </span>
                  </>
                ) : null}

                {/* Delete button — Always visible for deletion/cancellation */}
                <button
                  type="button"
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    requestDeleteById(slot.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDeleteById(slot.id);
                  }}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500/90 text-white rounded-full flex items-center justify-center text-xs leading-none shadow-md transition-all active:scale-90 active:bg-red-600 z-10"
                  aria-label="Hapus foto"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {slots.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">
            {emptyText}
          </p>
        )}

        {doneSlots.length > 1 && !isCompressing && (
          <p className="text-xs text-gray-400 mt-1.5">
            💡 Tap foto untuk preview · Tahan &amp; geser untuk ubah urutan
          </p>
        )}

        {isCompressing && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
            <span className="inline-block w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin" />
            Memproses foto...
          </p>
        )}
      </div>

      {/* Konfirmasi hapus — zIndex 1000000 agar muncul di atas PhotoViewer (999999) */}
      {deleteTargetId && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center px-6 bg-black/70 backdrop-blur-sm"
          style={{ zIndex: 1000000 }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-xs shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-red-500">
                <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white text-center mb-1">Hapus Foto?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
              Foto ini akan dihapus dari daftar. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
              >
                Tidak
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm active:bg-red-600 transition-colors"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <CameraOverlay
        isOpen={cameraOpen}
        onCapture={handleCameraCapture}
        onClose={() => setCameraOpen(false)}
      />

      <PhotoViewer
        photos={fotos.map((f) => f.base64)}
        initialIndex={viewerIndex}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        motorName={motorName || "Preview Foto"}
        onDelete={handleViewerDelete}
      />
    </>
  );
}
