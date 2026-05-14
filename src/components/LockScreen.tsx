"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import PatternLock from "@/components/PatternLock";

interface LockScreenProps {
  onSuccess: () => void;
}

type LockMode = "pin" | "password" | "pattern";

export default function LockScreen({ onSuccess }: LockScreenProps) {
  const [lockMode, setLockMode] = useState<LockMode>("pin");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [modeLoaded, setModeLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);

    const loadMode = async () => {
      try {
        // Cek cache sessionStorage dulu — hindari fetch ulang setiap mount
        const cached = sessionStorage.getItem("lock_mode");
        if (cached === "pin" || cached === "password" || cached === "pattern") {
          setLockMode(cached as LockMode);
          setModeLoaded(true);
          return;
        }

        const res = await fetch("/api/settings");
        const json = await res.json();
        
        if (json.status === "success" && json.data?.lockMode) {
          const fetchedMode = String(json.data.lockMode).toLowerCase();
          if (fetchedMode === "pin" || fetchedMode === "password" || fetchedMode === "pattern") {
            setLockMode(fetchedMode as LockMode);
            sessionStorage.setItem("lock_mode", fetchedMode);
          }
        }
      } catch {
        /* fallback ke pin */
      } finally {
        setModeLoaded(true);
      }
    };
    
    loadMode();
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  const handleFail = useCallback(() => {
    setPin("");
    setPassword("");
    triggerShake();
    setError("Kunci tidak valid");
    setTimeout(() => setError(""), 2000);
  }, [triggerShake]);

  const verify = useCallback(
    async (value: string) => {
      if (loading) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/settings/verify-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: value, mode: lockMode }),
        });
        const json = await res.json();
        if (json.status === "success") {
          setSuccess(true);
          setSuccessFlash(true);
          setTimeout(() => setSuccessFlash(false), 200); // Flash cepat
          sessionStorage.setItem("pin_verified", "1");
          setTimeout(() => onSuccess(), 800); // Delay lebih lama untuk animasi dramatis
        } else {
          handleFail();
        }
      } catch {
        setError("Koneksi terputus");
        setPin("");
        setPassword("");
        setTimeout(() => setError(""), 2000);
      } finally {
        setLoading(false);
      }
    },
    [loading, onSuccess, lockMode, handleFail]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (loading) return;
      setError("");
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 6) verify(newPin);
    },
    [pin, loading, verify]
  );

  const handleDelete = useCallback(() => {
    if (loading) return;
    setPin((p) => p.slice(0, -1));
    setError("");
  }, [loading]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    verify(password);
  };

  useEffect(() => {
    if (lockMode !== "pin") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleDigit(e.key);
      if (e.key === "Backspace") handleDelete();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lockMode, handleDigit, handleDelete]);

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-between overflow-hidden bg-[#0b1120] ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        transition: success
          ? "opacity 0.6s cubic-bezier(0.4,0,0.2,1), transform 0.6s cubic-bezier(0.4,0,0.2,1)"
          : "opacity 0.5s ease-out",
        opacity: success ? 0 : mounted ? 1 : 0,
        transform: success ? "scale(1.08)" : "scale(1)",
        pointerEvents: success ? "none" : "auto",
      }}
    >
      {/* Flash overlay saat unlock berhasil */}
      <div
        className="absolute inset-0 z-[200] pointer-events-none"
        style={{
          background: "white",
          opacity: successFlash ? 0.35 : 0,
          transition: "opacity 0.15s ease-out",
        }}
      />

      {/* Background Kotak-Kotak (Animated Grid) */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Latar Belakang Gradien Halus */}
        <div
          className="absolute inset-0 transition-all duration-700"
          style={{
            background: success
              ? "radial-gradient(circle at 50% 50%, #0d2d1a 0%, #0b1120 60%)"
              : "radial-gradient(circle at 50% 0%, #1e293b 0%, #0b1120 60%)",
          }}
        />
        {/* Layer Grid Berjalan */}
        <div className="absolute -inset-[40px] bg-grid-pattern opacity-20 animate-grid-slide" />
        {/* Masking Gradien agar bagian bawah dan tepi grid memudar dengan halus */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,transparent_0%,#0b1120_80%)]" />
        {/* Glow hijau saat sukses */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            background: "radial-gradient(circle at 50% 40%, rgba(34,197,94,0.12) 0%, transparent 60%)",
            opacity: success ? 1 : 0,
          }}
        />
      </div>

      {/* Konten Utama */}
      <div 
        className={`relative z-10 flex flex-col items-center w-full flex-1 justify-center px-6 py-8`}
        style={{
          transition: "transform 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.6s cubic-bezier(0.4,0,0.2,1)",
          transform: success ? "scale(1.15) translateY(-20px)" : mounted ? "scale(1) translateY(0)" : "scale(0.95) translateY(20px)",
          opacity: success ? 0 : mounted ? 1 : 0,
        }}
      >
        
        {/* Area Logo & Status Loading */}
        <div
          className={`flex flex-col items-center transition-all duration-700 delay-100 ${
            mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          {/* Wadah 24x24 (96px) untuk memberikan ruang bagi ring loading di sekeliling logo */}
          <div className="relative flex items-center justify-center w-24 h-24 mb-4">
            
            {/* Cincin Loading (Muncul & Berputar HANYA saat loading=true) */}
            <div 
              className={`absolute inset-0 rounded-full border-[3px] border-slate-700/40 border-t-blue-500 border-r-blue-400 transition-all duration-300 ${
                loading ? "opacity-100 animate-spin-slow" : "opacity-0 scale-90"
              }`} 
            />

            {/* Ring sukses hijau */}
            <div
              className="absolute inset-0 rounded-full border-[3px] border-transparent transition-all duration-500"
              style={{
                borderColor: success ? "#22c55e" : "transparent",
                boxShadow: success ? "0 0 24px rgba(34,197,94,0.5)" : "none",
                transform: success ? "scale(1.1)" : "scale(1)",
              }}
            />

            {/* Kotak Logo */}
            <div className={`relative w-16 h-16 bg-white/5 border border-white/10 rounded-[1.2rem] flex items-center justify-center shadow-lg backdrop-blur-md transition-all duration-300 ${loading ? "scale-90" : success ? "scale-110" : "scale-100"}`}
              style={{
                borderColor: success ? "rgba(34,197,94,0.4)" : undefined,
                background: success ? "rgba(34,197,94,0.15)" : undefined,
              }}
            >
              {success ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-10 h-10 fill-green-400" style={{ animation: "checkPop 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards" }}>
                  <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z" />
                </svg>
              ) : (
                <Image
                  src="/icons/sunan-full.png"
                  alt="Sunan Motor"
                  width={48}
                  height={48}
                  className="object-contain"
                  priority
                />
              )}
            </div>
          </div>

          <h1 className="text-slate-100 text-2xl font-bold tracking-wide font-sans">
            Sunan Motor
          </h1>
          <p className={`text-sm mt-1.5 font-medium tracking-wide transition-all duration-300 ${success ? "text-green-400" : "text-slate-400"}`}>
            {success ? "✓ Berhasil Dibuka" : !modeLoaded ? "Memuat Kunci..." : loading ? "Memverifikasi..." : lockMode === "pin" ? "Masukkan PIN Keamanan" : lockMode === "password" ? "Masukkan Kata Sandi" : "Gambar Pola Kunci"}
          </p>
        </div>

        {/* Input Area */}
        <div
          className={`w-full max-w-[300px] mt-8 transition-all duration-700 delay-200 ${
            mounted && modeLoaded ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          {/* ---- PIN MODE ---- */}
          {modeLoaded && lockMode === "pin" && (
            <>
              {/* PIN Dots (Gaya iOS) */}
              <div className={`flex gap-5 justify-center mb-10 ${shake ? "animate-shake" : ""}`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ease-out ${
                      success
                        ? "bg-green-400 scale-110 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                        : i < pin.length
                        ? "bg-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                        : "bg-transparent border-[1.5px] border-slate-500"
                    }`}
                  />
                ))}
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-y-3 gap-x-6">
                {digits.map((d, i) => {
                  if (d === "") return <div key={i} />;
                  const isDelete = d === "⌫";
                  return (
                    <div key={i} className="flex justify-center">
                      <button
                        onClick={() => (isDelete ? handleDelete() : handleDigit(d))}
                        disabled={loading}
                        className={`w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-200 outline-none select-none disabled:opacity-40
                        ${
                          isDelete
                            ? "text-2xl text-slate-300 hover:bg-white/5 active:bg-white/10"
                            : "text-3xl font-light text-slate-100 bg-transparent hover:bg-white/10 active:bg-white/20"
                        }`}
                      >
                        {d}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ---- PASSWORD MODE ---- */}
          {modeLoaded && lockMode === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 mt-4">
              <div className={`relative ${shake ? "animate-shake" : ""}`}>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  disabled={loading}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-slate-100 placeholder-slate-500 text-center text-lg outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all duration-300 disabled:opacity-50"
                  placeholder="Kata Sandi"
                  autoFocus
                  autoComplete="current-password"
                  style={{ fontSize: "16px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  disabled={loading}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-2 disabled:opacity-50"
                >
                  {showPass ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current">
                      <path d="M228,175a8,8,0,0,1-10.92-3l-19-33.2A123.23,123.23,0,0,1,162,155.46l5.87,35.22a8,8,0,0,1-6.58,9.21A8.4,8.4,0,0,1,160,200a8,8,0,0,1-7.88-6.69L146.3,158.9a124.06,124.06,0,0,1-36.6,0l-5.82,35.41A8,8,0,0,1,96,200a8.4,8.4,0,0,1-1.32-.11,8,8,0,0,1-6.58-9.21L94,155.46a123.23,123.23,0,0,1-36.06-16.69L39,172a8,8,0,1,1-13.94-7.94l20-35a8,8,0,0,1,11-2.89l.11.07A112,112,0,0,0,128,144a112,112,0,0,0,71.84-17.76l.11-.07a8,8,0,0,1,11,2.89l20,35A8,8,0,0,1,228,175Z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current">
                      <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="w-full py-4 rounded-2xl bg-white text-slate-900 font-semibold text-base transition-all duration-200 disabled:opacity-40"
              >
                Buka Kunci
              </button>
            </form>
          )}

          {/* ---- PATTERN MODE ---- */}
          {modeLoaded && lockMode === "pattern" && (
            <div className={`flex flex-col items-center ${shake ? "animate-shake" : ""}`}>
              <PatternLock
                onComplete={(pattern) => {
                  verify(pattern);
                }}
                title=""
                subtitle=""
                showCancel={false}
                theme="dark"
              />
              <p className="text-slate-500 text-xs mt-2">Hubungkan minimal 4 titik</p>
            </div>
          )}
        </div>

        {/* Error Message Area */}
        <div className="h-10 mt-6 flex items-center justify-center">
          <div
            className={`transition-all duration-300 ${
              error ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
            }`}
          >
            {error && (
              <span className="text-red-400 text-sm font-medium">
                {error}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pattern Lock Overlay — dihapus, pattern kini inline */}

      <style>{`
        /* Pattern Grid */
        .bg-grid-pattern {
          background-size: 32px 32px;
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
        }

        /* Animasi Grid Berjalan Mengalir Terus Menerus */
        .animate-grid-slide {
          animation: grid-slide 3.5s linear infinite;
        }

        @keyframes grid-slide {
          0% { transform: translateY(-32px); }
          100% { transform: translateY(0); }
        }

        /* Loading Putar Khusus Logo */
        .animate-spin-slow {
          animation: spin 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        /* Goyang jika salah kunci */
        .animate-shake {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }

        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }

        /* Pop animasi centang sukses */
        @keyframes checkPop {
          0%   { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          60%  { transform: scale(1.2) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
