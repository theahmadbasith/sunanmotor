"use client";

/**
 * OfflineIndicator — Banner kecil di atas saat offline atau ada pending sync
 */

interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
}

export default function OfflineIndicator({
  isOnline,
  pendingCount,
  isSyncing,
  onSyncNow,
}: OfflineIndicatorProps) {
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`w-full px-4 py-2 flex items-center justify-between text-xs font-semibold transition-all animate-fade-in ${
        !isOnline
          ? "bg-gray-800 text-white"
          : "bg-amber-500 text-white"
      }`}
    >
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <>
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span>Mode Offline — Data tersimpan lokal</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>{pendingCount} data menunggu upload</span>
          </>
        )}
      </div>

      {isOnline && pendingCount > 0 && !isSyncing && (
        <button
          onClick={onSyncNow}
          className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors"
        >
          Sync Sekarang
        </button>
      )}

      {isSyncing && (
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
          <span className="text-[10px]">Uploading...</span>
        </div>
      )}
    </div>
  );
}
