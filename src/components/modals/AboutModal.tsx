"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { AppSettings } from "@/types";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const [settings, setSettings] = useState<Partial<AppSettings>>({});

  // Tutup dengan Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Cegah scroll body
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Load pengaturan dari cache lokal
  useEffect(() => {
    if (isOpen) {
      try {
        const cached = localStorage.getItem("app_settings");
        if (cached) {
          setSettings(JSON.parse(cached));
        }
      } catch { /* ignore */ }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Ubah fallback dari hardcode menjadi pengingat untuk mengisi pengaturan
  const namaUsaha = settings.namaUsaha || "Nama Usaha (Belum Diatur)";
  const namaPemilik = settings.namaPemilik || "Belum diisi di Pengaturan";
  const nomorWa = settings.nomorWa || "";
  const displayWa = nomorWa || "Belum diisi di Pengaturan";
  
  // Format nomor WA hanya jika nomornya ada
  const formatWa = nomorWa ? (nomorWa.startsWith("0") ? "62" + nomorWa.slice(1) : nomorWa.replace(/\D/g, "")) : "";
  
  const catatanWelcome = settings.catatanWelcome || "Motto atau catatan belum diatur. Silakan isi di menu Pengaturan.";

  const handleWa = () => {
    if (!formatWa) {
      alert("Nomor WhatsApp belum diatur. Silakan isi di menu Pengaturan terlebih dahulu.");
      return;
    }
    window.open(`https://wa.me/${formatWa}`, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center px-4"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal card */}
      <div
        className="relative w-full bg-white dark:bg-gray-900 rounded-3xl shadow-2xl animate-slide-up overflow-hidden"
        style={{ maxWidth: "360px" }}
      >
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-900 px-6 pt-8 pb-10 text-center relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

          {/* Logo */}
          <div className="flex justify-center mb-3">
            <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg overflow-hidden">
              <Image
                src="/icons/sunan-full.png"
                alt={namaUsaha}
                width={64}
                height={64}
                className="object-contain"
                priority
              />
            </div>
          </div>

          <h2 className={`text-xl font-black text-white tracking-wide ${!settings.namaUsaha ? "italic opacity-90 text-lg" : ""}`}>
            {namaUsaha}
          </h2>
          <p className="text-brand-200 text-xs mt-1 font-medium">Aplikasi Bisnis Motor</p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Deskripsi */}
          <div className="bg-brand-50 dark:bg-brand-900/20 rounded-2xl p-4 border border-brand-100 dark:border-brand-800">
            <p className="text-sm text-gray-700 dark:text-gray-300 text-center leading-relaxed">
              Aplikasi rekap pembelian dan penjualan bisnis motor
            </p>
          </div>

          {/* Info pemilik */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-indigo-600 dark:fill-indigo-400">
                  <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pemilik</p>
                <p className={`text-sm ${!settings.namaPemilik ? "italic text-gray-500 dark:text-gray-400" : "font-bold text-gray-800 dark:text-white"}`}>
                  {namaPemilik}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-green-600 dark:fill-green-400">
                  <path d="M187.58,144.84l-32-16a8,8,0,0,0-8,.5l-14.69,9.8a40.55,40.55,0,0,1-16-16l9.8-14.69a8,8,0,0,0,.5-8l-16-32A8,8,0,0,0,104,64a40,40,0,0,0-40,40,88.1,88.1,0,0,0,88,88,40,40,0,0,0,40-40A8,8,0,0,0,187.58,144.84ZM152,176a72.08,72.08,0,0,1-72-72,24,24,0,0,1,19.29-23.54l11.48,22.95L101,117.11a8,8,0,0,0-.73,7.65,56.53,56.53,0,0,0,30.15,30.15,8,8,0,0,0,7.65-.73l13.7-9.19,22.95,11.48A24,24,0,0,1,152,176ZM128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a88,88,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216l12.47-37.4a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">WhatsApp</p>
                <button
                  onClick={handleWa}
                  className={`text-sm text-left ${nomorWa ? "font-bold text-green-600 dark:text-green-400 hover:underline" : "italic text-gray-500 dark:text-gray-400 cursor-not-allowed"}`}
                >
                  {displayWa}
                </button>
              </div>
            </div>
          </div>

          {/* Doa / Motto */}
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800 text-center">
            <p className="text-amber-800 dark:text-amber-300 text-sm font-semibold leading-relaxed">
              بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيم
            </p>
            <p className={`text-xs mt-1.5 leading-relaxed whitespace-pre-wrap ${!settings.catatanWelcome ? "italic text-amber-600/70 dark:text-amber-500/70" : "text-amber-700 dark:text-amber-400"}`}>
              {catatanWelcome}
            </p>
          </div>

          {/* Tombol tutup */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-2xl font-semibold text-gray-700 dark:text-gray-300 text-sm transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
