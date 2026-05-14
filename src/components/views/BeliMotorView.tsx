"use client";

import { useState, useEffect } from "react";
import { formatRupiah, cleanRupiah, formatCurrency } from "@/lib/utils";
import FotoUploadGrid, { type FotoSlot } from "@/components/FotoUploadGrid";
import { useFormCache } from "@/hooks/useFormCache";

interface BeliMotorViewProps {
  onSuccess: () => void;
  prefillData?: { namaMotor?: string; hargaBeli?: number; tanggal?: string };
}

interface FormState {
  namaMotor: string;
  hargaBeli: string;
  tanggal: string;
  slots: FotoSlot[];
}

const CACHE_KEY = "draft_beli_motor";

export default function BeliMotorView({ onSuccess, prefillData }: BeliMotorViewProps) {
  const [namaMotor, setNamaMotor] = useState(prefillData?.namaMotor || "");
  const [hargaBeli, setHargaBeli] = useState(
    prefillData?.hargaBeli ? formatRupiah(String(prefillData.hargaBeli)) : ""
  );
  const [tanggal, setTanggal] = useState("");
  const [slots, setSlots] = useState<FotoSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fotos = slots.filter((s) => s.foto).map((s) => s.foto!);
  const isCompressing = slots.some((s) => s.loading);

  const { clearCache } = useFormCache<FormState>({
    cacheKey: CACHE_KEY,
    data: { namaMotor, hargaBeli, slots },
    onRestore: (cached) => {
      if (!prefillData?.namaMotor) {
        if (cached.namaMotor) setNamaMotor(cached.namaMotor);
        if (cached.hargaBeli) setHargaBeli(cached.hargaBeli);
        if (cached.slots?.length) setSlots(cached.slots);
      }
    },
  });

  useEffect(() => {
    if (prefillData?.namaMotor) setNamaMotor(prefillData.namaMotor);
    if (prefillData?.hargaBeli) setHargaBeli(formatRupiah(String(prefillData.hargaBeli)));
    if (prefillData?.tanggal) {
      setTanggal(prefillData.tanggal);
    } else {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      const localDateTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
      setTanggal(localDateTime);
    }
  }, [prefillData]);

  const handleSubmit = async () => {
    if (isCompressing) { setError("Tunggu kompresi foto selesai."); return; }
    setError("");
    setLoading(true);
    try {
      if (!navigator.onLine) {
        const { syncQueueAdd, idbPut, STORES } = await import("@/lib/offlineDB");
        const offlineId = `offline_beli_${Date.now()}`;
        const payload = {
          _offlineId: offlineId,
          namaMotor: namaMotor.trim(),
          hargaBeli: cleanRupiah(hargaBeli),
          tanggal,
        };
        await idbPut(STORES.MOTOR_BELI, {
          id: offlineId,
          ...payload,
          fotos: [],
          status: "stok",
          _synced: false,
        });
        await syncQueueAdd({ action: "motor_beli", payload, fotos });
        clearCache();
        setNamaMotor(""); setHargaBeli(""); setTanggal(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); setSlots([]);
        onSuccess();
        return;
      }

      const res = await fetch("/api/beli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namaMotor: namaMotor.trim(),
          hargaBeli: cleanRupiah(hargaBeli),
          tanggal,
          fotos,
        }),
      });
      const json = await res.json();
      if (json.status === "success") {
        clearCache();
        setNamaMotor(""); setHargaBeli(""); setTanggal(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); setSlots([]);
        onSuccess();
      } else {
        setError(json.message || "Gagal menyimpan data");
      }
    } catch {
      setError("Koneksi gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* ── Form fields — ikut scroll normal ── */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-base font-bold text-gray-800 dark:text-white mb-3">Input Pembelian Motor</h2>

        <div className="card p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Nama Motor / Tipe / Tahun
            </label>
            <input
              type="text" value={namaMotor}
              onChange={(e) => setNamaMotor(e.target.value)}
              className="input-field" placeholder="Cth: Honda Beat 2022 Hitam"
              required autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Harga Beli (Kulak)
              </label>
              <div className="currency-wrapper">
                <span className="currency-prefix">Rp</span>
                <input
                  type="text" inputMode="numeric" value={hargaBeli}
                  onChange={(e) => setHargaBeli(formatRupiah(e.target.value))}
                  className="input-field with-prefix" placeholder="0" required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Waktu Beli
              </label>
              <input
                type="datetime-local" value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="input-field" required
              />
            </div>
          </div>

          {/* Info harga */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800">
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>Modal Beli:</span>
              <span className="font-bold text-gray-800 dark:text-white">{formatCurrency(cleanRupiah(hargaBeli))}</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Motor masuk ke stok. Bisa dijual dari menu Riwayat.
            </p>
          </div>
        </div>
      </div>

      {/* ── Foto + Submit — sticky di bawah, tidak ikut scroll ── */}
      <div
        className="sticky bottom-0 z-10 px-4 pb-3 pt-2 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800"
        style={{ boxShadow: "0 -4px 16px rgba(0,0,0,0.06)" }}
      >
        <FotoUploadGrid
          slots={slots}
          onSlotsChange={setSlots}
          motorName={namaMotor}
        />

        {error && (
          <div className="mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-2.5 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || isCompressing || !namaMotor.trim() || !hargaBeli}
          className="btn-primary mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
          ) : isCompressing ? (
            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menunggu kompresi...</>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
                <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
              </svg>
              Simpan Pembelian
            </>
          )}
        </button>
      </div>
    </div>
  );
}
