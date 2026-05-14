"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface CameraOverlayProps {
  isOpen: boolean;
  onCapture: (base64: string, fileName: string) => void;
  onClose: () => void;
}

const PHOTO_RATIO = 4 / 3;

export default function CameraOverlay({ isOpen, onCapture, onClose }: CameraOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string>("");
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);

  // Pinch-to-zoom state
  const lastPinchDist = useRef<number | null>(null);
  const lastZoom = useRef(1);

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopCamera();
      setZoom(1);
      lastZoom.current = 1;
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const stopCamera = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setZoomSupported(false);
  }, []);

  const startCamera = async (mode: "environment" | "user") => {
    stopCamera();
    setError("");
    setCameraReady(false);
    setZoom(1);
    lastZoom.current = 1;

    try {
      // Try high-res first, fallback to basic
      let mediaStream: MediaStream | null = null;
      const constraints: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        },
        {
          video: { facingMode: mode },
          audio: false,
        },
        {
          video: true,
          audio: false,
        },
      ];

      for (const c of constraints) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch {
          // try next
        }
      }

      if (!mediaStream) throw new Error("No camera available");

      streamRef.current = mediaStream;

      // Check capabilities
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const caps = videoTrack.getCapabilities?.() as MediaTrackCapabilities & {
          zoom?: { min: number; max: number; step: number };
        };
        if (caps?.zoom) {
          setZoomSupported(true);
          setMinZoom(caps.zoom.min ?? 1);
          setMaxZoom(Math.min(caps.zoom.max ?? 5, 8));
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await new Promise<void>((resolve) => {
          const video = videoRef.current;
          if (!video) return resolve();
          const onReady = () => {
            setCameraReady(true);
            resolve();
          };
          if (video.readyState >= 2) {
            setCameraReady(true);
            resolve();
            return;
          }
          video.addEventListener("loadeddata", onReady, { once: true });
          video.addEventListener("canplay", onReady, { once: true });
          // Fallback timeout
          setTimeout(() => { setCameraReady(true); resolve(); }, 2000);
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("not-allowed")) {
        setError("Izin kamera ditolak. Buka pengaturan browser dan izinkan akses kamera.");
      } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
        setError("Kamera tidak ditemukan di perangkat ini.");
      } else {
        setError("Tidak dapat mengakses kamera. Pastikan izin kamera sudah diberikan.");
      }
    }
  };

  const toggleCamera = useCallback(() => {
    const newMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newMode);
    startCamera(newMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const applyZoom = useCallback(async (newZoom: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomSupported) return;
    const clamped = Math.min(Math.max(newZoom, minZoom), maxZoom);
    try {
      await track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] });
      setZoom(clamped);
      lastZoom.current = clamped;
    } catch {
      // zoom not supported
    }
  }, [zoomSupported, minZoom, maxZoom]);

  // Native camera / file pick from top-right button — apply watermark + compression
  const handleGallerySelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    stopCamera();
    try {
      const { processAndCompressImage } = await import("@/lib/utils");
      const compressed = await processAndCompressImage(file, 1280, 500, true);
      if (compressed) {
        onCapture(compressed, file.name);
        onClose();
        return;
      }
    } catch { /* fallthrough */ }
    // Fallback: read raw base64 (no watermark/compression)
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onCapture(reader.result, file.name);
        onClose();
      }
    };
    reader.readAsDataURL(file);
  }, [stopCamera, onCapture, onClose]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || capturing || !cameraReady) return;
    setCapturing(true);
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);

    try {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 960;

      // Crop to 4:3
      let cropW = vw;
      let cropH = Math.round(vw * PHOTO_RATIO);
      if (cropH > vh) { cropH = vh; cropW = Math.round(vh / PHOTO_RATIO); }
      const cropX = Math.round((vw - cropW) / 2);
      const cropY = Math.round((vh - cropH) / 2);

      const outW = Math.min(cropW, 1080);
      const outH = Math.round(outW * PHOTO_RATIO);

      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
      await drawWatermark(ctx, outW, outH);

      const base64 = canvas.toDataURL("image/jpeg", 0.92);
      const fileName = `Kamera_${Date.now()}.jpg`;

      onCapture(base64, fileName);
      onClose();
    } catch (err) {
      console.error("[CameraOverlay] Capture error:", err);
      setError("Gagal mengambil foto. Coba lagi.");
    } finally {
      setCapturing(false);
    }
  }, [capturing, cameraReady, onCapture, onClose]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  // Pinch-to-zoom handlers
  const getPinchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastPinchDist.current = getPinchDist(e.touches);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null && zoomSupported) {
      e.preventDefault();
      const newDist = getPinchDist(e.touches);
      const delta = newDist / lastPinchDist.current;
      const newZoom = Math.min(Math.max(lastZoom.current * delta, minZoom), maxZoom);
      applyZoom(newZoom);
      lastPinchDist.current = newDist;
    }
  }, [zoomSupported, minZoom, maxZoom, applyZoom]);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed bg-black flex flex-col"
      style={{
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 999998,
        touchAction: "none",
        overscrollBehavior: "none",
        overflow: "hidden",
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden native camera input (top-right button) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleGallerySelect}
      />

      {/* Flash effect overlay */}
      {flashEffect && (
        <div className="absolute inset-0 z-50 bg-white pointer-events-none" style={{ opacity: 0.8 }} />
      )}

      {/* Top bar — native camera shortcut on right */}
      <div className="shrink-0 flex items-center justify-end px-4 py-3 z-30">
        <button
          onClick={() => galleryInputRef.current?.click()}
          className="w-11 h-11 rounded-full bg-black/50 border border-white/20 flex items-center justify-center transition-colors active:bg-black/70"
          aria-label="Buka kamera native"
          title="Buka kamera bawaan"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
            <path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.72,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.65-3.56L100.28,48h55.44l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z" />
          </svg>
        </button>
      </div>

      {/* Video area — fills remaining space */}
      <div
        className="flex-1 relative w-full flex items-center justify-center overflow-hidden bg-[#111]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        />

        {/* Guide frame 3:4 */}
        <div
          className="relative z-10 pointer-events-none w-full"
          style={{
            aspectRatio: "3/4",
            maxHeight: "100%",
            maxWidth: "min(100%, calc(100vh * 3/4))",
          }}
        >
          {/* Corner brackets */}
          {[
            "top-0 left-0 border-t-2 border-l-2 rounded-tl-lg",
            "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg",
            "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg",
            "bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg",
          ].map((cls, i) => (
            <div key={i} className={`absolute w-8 h-8 border-white/80 ${cls}`} />
          ))}

          {/* Grid overlay */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "33.33% 33.33%",
            }}
          />

          {/* Ratio badge */}
          <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-20">
            3:4
          </div>

          {/* Watermark preview */}
          <div
            className="absolute z-20 pointer-events-none flex items-center"
            style={{
              top: "2.5cqi",
              left: "2.5cqi",
              backgroundColor: "rgba(10,15,35,0.82)",
              padding: "0.6cqi 2.5cqi",
              borderRadius: "9999px",
              gap: "1.25cqi",
              opacity: 0.85,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/sunan-32.png"
              alt=""
              style={{ width: "9cqi", height: "9cqi", opacity: 0.95, objectFit: "contain" }}
            />
            <span
              className="text-white opacity-95"
              style={{
                fontSize: "2.2cqi",
                fontWeight: "bold",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              Sunan Motor
            </span>
          </div>

          {/* Camera not ready indicator */}
          {!cameraReady && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 75% 75% at 50% 50%, transparent 0%, transparent 60%, rgba(0,0,0,0.4) 100%)",
          }}
        />

        {/* Zoom indicator */}
        {zoomSupported && zoom > 1.05 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-black/60 text-white text-xs font-bold px-3 py-1 rounded-full pointer-events-none">
            {zoom.toFixed(1)}×
          </div>
        )}
      </div>

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6 z-40">
          <div className="text-center text-white max-w-xs">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              className="w-12 h-12 fill-red-400 mx-auto mb-3"
            >
              <path d="M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z" />
            </svg>
            <p className="text-sm mb-5 leading-relaxed">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setError(""); startCamera(facingMode); }}
                className="px-5 py-2 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition-colors"
              >
                Coba Lagi
              </button>
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-red-500/80 hover:bg-red-500 rounded-full text-sm font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom controls — always above home indicator */}
      <div
        className="shrink-0 relative z-30 w-full bg-black/90 backdrop-blur-md"
        style={{
          paddingBottom: `max(1.5rem, env(safe-area-inset-bottom))`,
          paddingTop: "1.25rem",
        }}
      >
        {/* Zoom slider */}
        {zoomSupported && (
          <div className="flex items-center gap-3 px-10 mb-4">
            <span className="text-white/50 text-xs w-6 text-center">{minZoom}×</span>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.1}
              value={zoom}
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
              className="flex-1 h-1 accent-white cursor-pointer"
            />
            <span className="text-white/50 text-xs w-6 text-center">{maxZoom}×</span>
          </div>
        )}

        {/* Capture row — X · Shutter · Flip */}
        <div className="flex justify-around items-center px-6">
          {/* Close button (left) */}
          <button
            onClick={handleClose}
            className="w-14 h-14 rounded-full bg-white/15 border-2 border-white/20 flex items-center justify-center transition-colors active:bg-white/30"
            aria-label="Tutup kamera"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-white">
              <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
            </svg>
          </button>

          {/* Capture button — center, large */}
          <button
            onClick={capturePhoto}
            disabled={capturing || !cameraReady}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-colors disabled:opacity-50 select-none"
            style={{
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
            }}
            aria-label="Ambil foto"
          >
            {capturing || !cameraReady ? (
              <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white" />
            )}
          </button>

          {/* Flip camera button (right) */}
          <button
            onClick={toggleCamera}
            className="w-14 h-14 rounded-full bg-white/15 border-2 border-white/20 flex items-center justify-center transition-colors active:bg-white/30"
            aria-label="Ganti kamera"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-white">
              <path d="M240,56a8,8,0,0,1-8,8H204.94l6.22,6.22a8,8,0,1,1-11.32,11.32l-20-20a8,8,0,0,1,0-11.32l20-20A8,8,0,0,1,211.16,41.6L204.94,48H232A8,8,0,0,1,240,56ZM51.06,208H24a8,8,0,0,0,0,16H51.06l-6.22,6.22a8,8,0,1,0,11.32,11.32l20-20a8,8,0,0,0,0-11.32l-20-20a8,8,0,0,0-11.32,11.32ZM200,128a72,72,0,1,1-72-72A72.08,72.08,0,0,1,200,128Zm-16,0a56,56,0,1,0-56,56A56.06,56.06,0,0,0,184,128Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

async function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number): Promise<void> {
  return new Promise((resolve) => {
    const logoSize = Math.round(W * 0.09);
    const padding = Math.round(W * 0.025);
    const textSize = Math.round(W * 0.022);
    const text = "Sunan Motor";

    const drawPill = (logoImg?: HTMLImageElement) => {
      try {
        ctx.font = `bold ${textSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        const tw = ctx.measureText(text).width;
        const pillW = (logoImg ? logoSize + padding * 0.5 : 0) + tw + padding * 2;
        const pillH = Math.max(logoImg ? logoSize : 0, textSize * 1.5) + padding * 0.6;
        const pillX = padding;
        const pillY = padding;

        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = "rgba(10,15,35,0.82)";
        rrPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.restore();

        if (logoImg) {
          const lx = pillX + padding * 0.6;
          const ly = pillY + (pillH - logoSize) / 2;
          ctx.save();
          ctx.globalAlpha = 0.95;
          ctx.drawImage(logoImg, lx, ly, logoSize, logoSize);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${textSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
          ctx.textBaseline = "middle";
          ctx.fillText(text, lx + logoSize + padding * 0.5, pillY + pillH / 2);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${textSize}px sans-serif`;
          ctx.textBaseline = "middle";
          ctx.fillText(text, pillX + padding, pillY + pillH / 2);
          ctx.restore();
        }
      } catch {
        /* ignore */
      }
      resolve();
    };

    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => drawPill(), 2000);
    img.onload = () => { clearTimeout(t); drawPill(img); };
    img.onerror = () => { clearTimeout(t); drawPill(); };
    img.src = "/icons/sunan-32.png";
  });
}

function rrPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
