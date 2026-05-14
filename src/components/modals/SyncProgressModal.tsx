"use client";

/**
 * SyncProgressModal — Layar progress upload saat sinkronisasi berlangsung
 * Menampilkan detail persentase, item yang sedang diproses, dan status akhir
 */

import type { SyncProgress } from "@/lib/syncEngine";

interface SyncProgressModalProps {
  progress: SyncProgress | null;
  onDismiss: () => void;
}

export default function SyncProgressModal({ progress, onDismiss }: SyncProgressModalProps) {
  if (!progress || progress.phase === "idle") return null;

  const isDone = progress.phase === "done";
  const isError = progress.phase === "error";
  const isSyncing = progress.phase === "syncing";

  return (
    // UBAH: items-end menjadi items-center agar posisinya di tengah layar
    <div 
      className="fixed inset-0 z-[99990] flex items-center justify-center px-4"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Backdrop — hanya bisa dismiss jika sudah selesai */}
      {(isDone || isError) && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={onDismiss} />
      )}
      {isSyncing && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300" />
      )}

      {/* Card */}
      <div
        // UBAH: rounded-t-3xl menjadi rounded-3xl agar semua sudut melengkung.
        // Menghapus animate-slide-up agar tidak meluncur dari bawah. 
        className="relative w-full bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden transform transition-all duration-300"
        style={{ maxWidth: "480px" }}
      >
        {/* Top accent bar - overflow-hidden pada parent akan otomatis memotong ujungnya agar tetap melengkung */}
        <div className={`h-1.5 w-full transition-all duration-500 ${
          isDone ? "bg-green-500" : isError ? "bg-red-500" : "bg-brand-500"
        }`} style={{ width: `${progress.percent}%` }} />

        <div className="px-6 pt-5 pb-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              isDone ? "bg-green-100 dark:bg-green-900/30"
              : isError ? "bg-red-100 dark:bg-red-900/30"
              : "bg-brand-100 dark:bg-brand-900/30"
            }`}>
              {isSyncing ? (
                <div className="w-5 h-5 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
              ) : isDone ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-green-600 dark:fill-green-400">
                  <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-red-600 dark:fill-red-400">
                  <path d="M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-800 dark:text-white text-base">
                {isSyncing ? "Menyinkronkan Data..." : isDone ? "Sinkronisasi Selesai!" : "Ada Masalah"}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {progress.current || "Memproses..."}
              </p>
            </div>
            <span className={`text-lg font-black shrink-0 ${
              isDone ? "text-green-600" : isError ? "text-red-600" : "text-brand-600"
            }`}>
              {progress.percent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 mb-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isDone ? "bg-green-500" : isError ? "bg-red-500" : "bg-brand-500"
              }`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          {/* Stats */}
          {progress.total > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-gray-800 dark:text-white">{progress.total}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Total</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-green-600 dark:text-green-400">{progress.done}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Berhasil</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${
                progress.errors.length > 0
                  ? "bg-red-50 dark:bg-red-900/20"
                  : "bg-gray-50 dark:bg-gray-800"
              }`}>
                <p className={`text-lg font-black ${
                  progress.errors.length > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400"
                }`}>{progress.errors.length}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Error</p>
              </div>
            </div>
          )}

          {/* Error list */}
          {progress.errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4 max-h-24 overflow-y-auto">
              {progress.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400 leading-relaxed">• {e}</p>
              ))}
            </div>
          )}

          {/* Action button */}
          {(isDone || isError) && (
            <button
              onClick={onDismiss}
              className={`w-full py-3 rounded-2xl font-bold text-sm transition-all ${
                isDone
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              }`}
            >
              {isDone ? "Tutup" : "Mengerti"}
            </button>
          )}

          {/* Hint saat syncing */}
          {isSyncing && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
              Jangan tutup aplikasi saat proses berlangsung
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
