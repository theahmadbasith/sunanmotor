"use client";

import { useState, useEffect } from "react";
import { formatRupiah, cleanRupiah, formatCurrency } from "@/lib/utils";
import { useFormCache } from "@/hooks/useFormCache";
import FotoUploadGrid, { type FotoSlot } from "@/components/FotoUploadGrid";

interface TarikViewProps {
  currentSaldo: number;
  onSuccess: () => void;
  prefillData?: {
    keperluan?: string;
    nominal?: number;
    tanggal?: string;
  };
}

interface FormState {
  keperluan: string;
  nominal: string;
  tanggal: string;
  slots: FotoSlot[];
}

const CACHE_KEY = "draft_tarik_saldo";

export default function TarikView({ currentSaldo, onSuccess, prefillData }: TarikViewProps) {

  const [keperluan, setKeperluan] = useState(prefillData?.keperluan || "");
  const [nominal, setNominal] = useState(
    prefillData?.nominal ? formatRupiah(prefillData.nominal.toString()) : ""
  );
  const [tanggal, setTanggal] = useState("");
  const [slots, setSlots] = useState<FotoSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fotos = slots.filter((s) => s.foto).map((s) => s.foto!);
  const isCompressing = slots.some((s) => s.loading);

  // IndexedDB cache
  const formData: FormState = { keperluan, nominal, slots };
  const { clearCache } = useFormCache<FormState>({
    cacheKey: CACHE_KEY,
    data: formData,
    onRestore: (cached) => {
      // Hanya restore jika tidak ada prefill dari voice
      if (!prefillData?.keperluan) {
        if (cached.keperluan) setKeperluan(cached.keperluan);
        if (cached.nominal) setNominal(cached.nominal);
        if (cached.slots?.length) setSlots(cached.slots);
      }
    },
  });

  // Update prefill jika berubah (dari voice input) - AUTO REPLACE
  useEffect(() => {
    if (prefillData) {
      if (prefillData.keperluan !== undefined) setKeperluan(prefillData.keperluan);
      if (prefillData.nominal !== undefined) setNominal(formatRupiah(prefillData.nominal.toString()));
      if (prefillData.tanggal !== undefined) {
        setTanggal(prefillData.tanggal);
      }
    } else {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      const localDateTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
      setTanggal(localDateTime);
    }
  }, [prefillData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCompressing) { setError("Tunggu kompresi foto selesai."); return; }
    setError("");

    const nominalNum = cleanRupiah(nominal);
    const finalKeperluan = keperluan.trim().replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());

    if (!keperluan.trim()) {
      setError("Keperluan wajib diisi.");
      return;
    }
    if (nominalNum <= 0) {
      setError("Nominal harus lebih dari 0.");
      return;
    }

    setLoading(true);
    try {
      // Offline mode
      if (!navigator.onLine) {
        const { syncQueueAdd, idbPut, STORES } = await import("@/lib/offlineDB");
        const offlineId = `offline_exp_${Date.now()}`;
        const payload = {
          _offlineId: offlineId,
          keperluan: finalKeperluan,
          nominal: nominalNum,
          tanggal,
        };
        await idbPut(STORES.PENGELUARAN, {
          id: offlineId,
          ...payload,
          fotos: [],
          folderId: "",
          _synced: false,
        });
        await syncQueueAdd({ action: "pengeluaran", payload, fotos });
        clearCache();
        setKeperluan("");
        setNominal("");
        setTanggal(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
        setSlots([]);
        onSuccess();
        return;
      }

      const res = await fetch("/api/pengeluaran", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keperluan: finalKeperluan, nominal: nominalNum, tanggal, fotos }),
      });

      const json = await res.json();
      if (json.status === "success") {
        // Hapus cache & reset form
        clearCache();
        setKeperluan("");
        setNominal("");
        setTanggal(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
        setSlots([]);
        onSuccess();
      } else {
        setError(json.message || "Gagal menyimpan pengeluaran");
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
        <h2 className="text-base font-bold text-gray-800 dark:text-white mb-3">
          Pengeluaran
        </h2>

        {/* Saldo Info */}
        <div className={`p-4 rounded-2xl text-white mb-4 shadow-md ${
          currentSaldo < 0
            ? "bg-gradient-to-r from-red-600 to-rose-700"
            : "bg-gradient-to-r from-orange-500 to-red-500"
        }`}>
          <p className="text-sm opacity-90 mb-1">
            {currentSaldo < 0 ? "⚠️ Saldo Minus:" : "Saldo Tersedia:"}
          </p>
          <h3 className="text-2xl font-bold">
            {currentSaldo < 0
              ? `−${formatCurrency(Math.abs(currentSaldo))}`
              : formatCurrency(currentSaldo)
            }
          </h3>
          {currentSaldo < 0 && (
            <p className="text-xs text-red-200 mt-1">Pengeluaran akan menambah defisit saldo</p>
          )}
        </div>

        <div className="card p-4">
          <form id="form-pengeluaran" onSubmit={handleSubmit} className="space-y-3">
            {/* Keperluan */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Keperluan Pengeluaran
              </label>
              <input
                type="text"
                value={keperluan}
                onChange={(e) => setKeperluan(e.target.value)}
                className="input-field"
                placeholder="Cth: Bayar Kos, Beli Makan, Bagi Hasil..."
                required
                autoComplete="off"
              />
            </div>

            {/* Nominal */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Nominal (Rp)
              </label>
              <div className="currency-wrapper">
                <span className="currency-prefix">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={nominal}
                  onChange={(e) => setNominal(formatRupiah(e.target.value))}
                  className="input-field with-prefix"
                  placeholder="0"
                  required
                />
              </div>
            </div>

            {/* Tanggal */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Waktu
              </label>
              <input
                type="datetime-local"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </form>
        </div>
      </div>

      {/* ── Foto + Submit — sticky di bawah ── */}
      <div
        className="sticky bottom-0 z-10 px-4 pb-3 pt-2 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800"
        style={{ boxShadow: "0 -4px 16px rgba(0,0,0,0.06)" }}
      >
        <FotoUploadGrid
          slots={slots}
          onSlotsChange={setSlots}
          motorName={keperluan || "Bukti Nota"}
          maxImages={3}
          label="Foto Nota / Bukti Pembayaran"
          emptyText="Belum ada foto nota. Foto pertama = thumbnail utama."
        />

        {/* Error */}
        {error && (
          <div className="mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-2.5 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          form="form-pengeluaran"
          disabled={loading || isCompressing || !keperluan.trim() || !nominal}
          className="btn-danger mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Menyimpan...
            </>
          ) : isCompressing ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Menunggu kompresi...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
                <path d="M216,72H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,64V192a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V88A16,16,0,0,0,216,72Zm0,128H56a8,8,0,0,1-8-8V86.63A23.84,23.84,0,0,0,56,88H216Zm-48-60a12,12,0,1,1,12,12A12,12,0,0,1,168,140Z" />
              </svg>
              Simpan Pengeluaran
            </>
          )}
        </button>
      </div>
    </div>
  );
}
