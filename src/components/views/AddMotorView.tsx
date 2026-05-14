"use client";

import { useState, useEffect } from "react";
import { formatRupiah, cleanRupiah, formatCurrency } from "@/lib/utils";
import FotoUploadGrid, { type FotoSlot } from "@/components/FotoUploadGrid";
import { useFormCache } from "@/hooks/useFormCache";
import type { DetailRestorasi } from "@/types";

interface AddMotorViewProps {
  onSuccess: () => void;
  prefillData?: {
    namaMotor?: string;
    hargaBeli?: number;
    biayaReparasi?: number;
    hargaJual?: number;
    tanggal?: string;
    idBeli?: string;
    fotosBeli?: string[];
    detailRestorasi?: DetailRestorasi[];
  };
}

interface FormState {
  namaMotor: string;
  hargaBeli: string;
  biayaReparasi: string;
  hargaJual: string;
  tanggal: string;
  slots: FotoSlot[];
  detailRestorasi: DetailRestorasi[];
}

const CACHE_KEY = "draft_add_motor";

export default function AddMotorView({ onSuccess, prefillData }: AddMotorViewProps) {
  const [namaMotor, setNamaMotor] = useState(prefillData?.namaMotor || "");
  const [hargaBeli, setHargaBeli] = useState(
    prefillData?.hargaBeli ? formatRupiah(String(prefillData.hargaBeli)) : ""
  );
  const [biayaReparasi, setBiayaReparasi] = useState(
    prefillData?.biayaReparasi ? formatRupiah(String(prefillData.biayaReparasi)) : ""
  );
  const [hargaJual, setHargaJual] = useState(
    prefillData?.hargaJual ? formatRupiah(String(prefillData.hargaJual)) : ""
  );
  const [tanggal, setTanggal] = useState("");
  const [slots, setSlots] = useState<FotoSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Detail restorasi — list item (nama + biaya)
  const [detailRestorasi, setDetailRestorasi] = useState<DetailRestorasi[]>(
    prefillData?.detailRestorasi || []
  );
  // Mode input: "detail" = per item, "total" = langsung total
  const [restorasiMode, setRestorasiMode] = useState<"detail" | "total">("detail");
  const [showRestorasiForm, setShowRestorasiForm] = useState(false);
  const [newItemNama, setNewItemNama] = useState("");
  const [newItemBiaya, setNewItemBiaya] = useState("");

  const fotos = slots.filter((s) => s.foto).map((s) => s.foto!);
  const isCompressing = slots.some((s) => s.loading);

  const beli = cleanRupiah(hargaBeli);
  // Hitung total restorasi dari detail items, atau dari input manual
  const totalRestorasiDetail = detailRestorasi.reduce((sum, d) => sum + d.biaya, 0);
  const repair = restorasiMode === "detail" ? totalRestorasiDetail : cleanRupiah(biayaReparasi);
  const jual = cleanRupiah(hargaJual);
  const modal = beli + repair;
  const untung = jual > 0 ? jual - modal : 0;

  const { clearCache } = useFormCache<FormState>({
    cacheKey: CACHE_KEY,
    data: { namaMotor, hargaBeli, biayaReparasi, hargaJual, slots, detailRestorasi },
    onRestore: (cached) => {
      if (!prefillData?.namaMotor) {
        if (cached.namaMotor) setNamaMotor(cached.namaMotor);
        if (cached.hargaBeli) setHargaBeli(cached.hargaBeli);
        if (cached.biayaReparasi) setBiayaReparasi(cached.biayaReparasi);
        if (cached.hargaJual) setHargaJual(cached.hargaJual);
        if (cached.slots?.length) setSlots(cached.slots);
        if (cached.detailRestorasi?.length) setDetailRestorasi(cached.detailRestorasi);
      }
    },
  });

  // Update prefill jika berubah (dari voice atau lanjut jual) - AUTO REPLACE
  useEffect(() => {
    if (prefillData) {
      if (prefillData.namaMotor !== undefined) setNamaMotor(prefillData.namaMotor);
      if (prefillData.hargaBeli !== undefined) setHargaBeli(formatRupiah(String(prefillData.hargaBeli)));
      if (prefillData.biayaReparasi !== undefined) setBiayaReparasi(formatRupiah(String(prefillData.biayaReparasi)));
      if (prefillData.hargaJual !== undefined) setHargaJual(formatRupiah(String(prefillData.hargaJual)));
      if (prefillData.tanggal !== undefined) setTanggal(prefillData.tanggal);
      if (prefillData.detailRestorasi?.length) {
        setDetailRestorasi(prefillData.detailRestorasi);
        setRestorasiMode("detail");
      }
    } else {
      // Set to current real-time date and time if no prefill
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      const localDateTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
      setTanggal(localDateTime);
    }
  }, [prefillData]);

  const addRestorasiItem = () => {
    const nama = newItemNama.trim();
    const biaya = cleanRupiah(newItemBiaya);
    if (!nama || biaya <= 0) return;
    setDetailRestorasi((prev) => [...prev, { nama, biaya }]);
    setNewItemNama("");
    setNewItemBiaya("");
  };

  const removeRestorasiItem = (idx: number) => {
    setDetailRestorasi((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (isCompressing) { setError("Tunggu kompresi foto selesai."); return; }
    setError("");

    const beliNum = cleanRupiah(hargaBeli);
    const repairNum = restorasiMode === "detail" ? totalRestorasiDetail : cleanRupiah(biayaReparasi);
    const jualNum = cleanRupiah(hargaJual);
    const finalDetail = restorasiMode === "detail" ? detailRestorasi : [];

    setLoading(true);
    const finalNamaMotor = namaMotor.trim().toUpperCase();
    try {
      if (!navigator.onLine) {
        const { syncQueueAdd, idbPut, STORES } = await import("@/lib/offlineDB");
        const offlineId = `offline_jual_${Date.now()}`;
        const payload = {
          _offlineId: offlineId,
          namaMotor: finalNamaMotor,
          hargaBeli: beliNum,
          biayaReparasi: repairNum,
          detailRestorasi: finalDetail,
          hargaJual: jualNum,
          tanggal,
          idBeli: prefillData?.idBeli || "",
        };
        await idbPut(STORES.MOTOR_JUAL, {
          id: offlineId,
          ...payload,
          totalModal: beliNum + repairNum,
          untungBersih: jualNum - (beliNum + repairNum),
          fotos: [],
          _synced: false,
        });
        await syncQueueAdd({ action: "motor_jual", payload, fotos });
        clearCache();
        resetForm();
        onSuccess();
        return;
      }

      const res = await fetch("/api/motor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namaMotor: finalNamaMotor,
          hargaBeli: beliNum,
          biayaReparasi: repairNum,
          detailRestorasi: finalDetail,
          hargaJual: jualNum,
          tanggal,
          fotos,
          idBeli: prefillData?.idBeli || "",
        }),
      });
      const json = await res.json();
      if (json.status === "success") {
        clearCache();
        resetForm();
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

  const resetForm = () => {
    setNamaMotor(""); setHargaBeli(""); setBiayaReparasi(""); setHargaJual("");
    setDetailRestorasi([]);
    setTanggal(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setSlots([]);
  };

  return (
    <div className="animate-fade-in">
      {/* ── Form fields — ikut scroll normal ── */}
      <div className="px-4 pt-4 pb-2">
        {prefillData?.idBeli && (
          <div className="mb-3 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl p-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-brand-600 dark:fill-brand-400 shrink-0">
              <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34Z" />
            </svg>
            <p className="text-xs text-brand-700 dark:text-brand-300 font-medium">
              Melanjutkan dari data pembelian · ID: {prefillData.idBeli}
            </p>
          </div>
        )}

        <h2 className="text-base font-bold text-gray-800 dark:text-white mb-3">Input Data Penjualan</h2>

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
                Harga Beli
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
                Harga Jual
              </label>
              <div className="currency-wrapper">
                <span className="currency-prefix">Rp</span>
                <input
                  type="text" inputMode="numeric" value={hargaJual}
                  onChange={(e) => setHargaJual(formatRupiah(e.target.value))}
                  className="input-field with-prefix" placeholder="0" required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Waktu Jual
            </label>
            <input
              type="datetime-local" value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="input-field" required
            />
          </div>

          {/* ── BIAYA RESTORASI ── */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-amber-600 dark:fill-amber-400">
                  <path d="M226.76,69a8,8,0,0,0-12.84-2.88l-40.3,37.19-17.23-4.5-4.5-17.23,37.19-40.3A8,8,0,0,0,186.2,28.29,72,72,0,0,0,88,96a72.34,72.34,0,0,0,1.07,12.29L45.46,152A24,24,0,0,0,79.46,186l43.66-43.54A72.34,72.34,0,0,0,135.4,143.6,72,72,0,0,0,226.76,69Z" />
                </svg>
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Biaya Restorasi</span>
                {repair > 0 && (
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
                    {formatCurrency(repair)}
                  </span>
                )}
              </div>
              {/* Toggle mode */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRestorasiMode("detail")}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${restorasiMode === "detail" ? "bg-amber-600 text-white" : "text-amber-700 dark:text-amber-400"}`}
                >
                  Per Item
                </button>
                <button
                  type="button"
                  onClick={() => setRestorasiMode("total")}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${restorasiMode === "total" ? "bg-amber-600 text-white" : "text-amber-700 dark:text-amber-400"}`}
                >
                  Total
                </button>
              </div>
            </div>

            {/* Mode: input total langsung */}
            {restorasiMode === "total" && (
              <div className="px-3 pb-3">
                <div className="currency-wrapper">
                  <span className="currency-prefix">Rp</span>
                  <input
                    type="text" inputMode="numeric" value={biayaReparasi}
                    onChange={(e) => setBiayaReparasi(formatRupiah(e.target.value))}
                    className="input-field with-prefix" placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* Mode: per item detail */}
            {restorasiMode === "detail" && (
              <div className="px-3 pb-3 space-y-2">
                {/* List item yang sudah ditambahkan */}
                {detailRestorasi.length > 0 && (
                  <div className="space-y-1.5">
                    {detailRestorasi.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-2.5 py-1.5 border border-amber-100 dark:border-amber-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{item.nama}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{formatCurrency(item.biaya)}</span>
                          <button type="button" onClick={() => removeRestorasiItem(idx)} className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3 h-3 fill-current"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-[11px] font-bold text-amber-800 dark:text-amber-300 px-1 pt-1 border-t border-amber-200 dark:border-amber-700">
                      <span>Total Restorasi</span>
                      <span>{formatCurrency(totalRestorasiDetail)}</span>
                    </div>
                  </div>
                )}

                {/* Form tambah item baru */}
                {showRestorasiForm ? (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-amber-200 dark:border-amber-700 space-y-2">
                    <input
                      type="text"
                      value={newItemNama}
                      onChange={(e) => setNewItemNama(e.target.value)}
                      className="input-field text-xs"
                      placeholder="Nama item (cth: Oli, Bengkel, Cat)"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <div className="currency-wrapper flex-1">
                        <span className="currency-prefix">Rp</span>
                        <input
                          type="text" inputMode="numeric"
                          value={newItemBiaya}
                          onChange={(e) => setNewItemBiaya(formatRupiah(e.target.value))}
                          className="input-field with-prefix text-xs" placeholder="0"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRestorasiItem(); } }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addRestorasiItem}
                        disabled={!newItemNama.trim() || !newItemBiaya}
                        className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 shrink-0"
                      >
                        Tambah
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowRestorasiForm(false); setNewItemNama(""); setNewItemBiaya(""); }}
                        className="px-2 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold shrink-0"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRestorasiForm(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" /></svg>
                    Tambah Item Restorasi
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Kalkulasi */}
          <div className="bg-brand-50 dark:bg-brand-900/20 p-3 rounded-xl border border-brand-100 dark:border-brand-800">
            <div className="flex justify-between text-xs mb-1 text-gray-600 dark:text-gray-400">
              <span>Total Modal:</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(modal)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-brand-200 dark:border-brand-700 pt-2 mt-1">
              <span className="text-brand-900 dark:text-brand-200">Untung Bersih:</span>
              <span className={untung < 0 && jual > 0 ? "text-red-600" : "text-green-600"}>
                {formatCurrency(untung)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Foto + Submit — sticky di bawah, tidak ikut scroll ── */}
      <div
        className="sticky bottom-0 z-10 px-4 pb-3 pt-2 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800"
        style={{ boxShadow: "0 -4px 16px rgba(0,0,0,0.06)" }}
      >
        <FotoUploadGrid slots={slots} onSlotsChange={setSlots} motorName={namaMotor} />

        {error && (
          <div className="mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-2.5 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || isCompressing || !namaMotor.trim() || !hargaBeli || !hargaJual}
          className="btn-primary mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan & Upload Foto...</>
          ) : isCompressing ? (
            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menunggu kompresi...</>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
                <path d="M219.31,72,184,36.69A15.86,15.86,0,0,0,172.69,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V83.31A15.86,15.86,0,0,0,219.31,72ZM168,208H88V152h80Zm40,0H184V152a16,16,0,0,0-16-16H88a16,16,0,0,0-16,16v56H48V48H172.69L208,83.31ZM160,72a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h40A8,8,0,0,1,160,72Z" />
              </svg>
              Simpan Data Penjualan
            </>
          )}
        </button>
      </div>
    </div>
  );
}
