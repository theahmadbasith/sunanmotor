"use client";

import { useState, useEffect, useRef } from "react";
import WhatsAppPreviewModal from "./WhatsAppPreviewModal";
import PrintReport from "@/components/modals/PrintReport";
import { formatDatePrint } from "@/lib/utils";
import type { MotorData, MotorBeliData, PengeluaranData } from "@/types";
import { useBackButton } from "@/hooks/useBackButton";

type RangeType = "week" | "month" | "custom";

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReportsModal({ isOpen, onClose }: ReportsModalProps) {
  const [rangeType, setRangeType] = useState<RangeType>("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [waPreviewOpen, setWaPreviewOpen] = useState(false);
  const [waMessage, setWaMessage] = useState("");
  const [namaUsahaState, setNamaUsahaState] = useState("Sunan Motor");
  const [reportData, setReportData] = useState<{
    penjualan: MotorData[];
    pengeluaran: PengeluaranData[];
    stokMotor: MotorBeliData[];
    totalHargaBeli: number;
    totalReparasi: number;
    totalModal: number;
    totalJual: number;
    totalProfit: number;
    totalPengeluaran: number;
    totalHargaBeliStok: number;
    labaBersih: number;
  } | null>(null);

  // Ref untuk deteksi swipe (tanpa animasi CSS)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const switchRangeTab = (newType: RangeType) => {
    if (newType === rangeType) return;
    if (newType !== "custom") {
      applyRangePreset(newType);
    } else {
      setRangeType("custom");
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0));
    
    // Deteksi geseran horizontal yang cukup jauh
    if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.5) {
      if (dx > 0) { // Geser ke kiri (Next)
        if (rangeType === "week") switchRangeTab("month");
        else if (rangeType === "month") switchRangeTab("custom");
      } else { // Geser ke kanan (Prev)
        if (rangeType === "custom") switchRangeTab("month");
        else if (rangeType === "month") switchRangeTab("week");
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  useEffect(() => {
    applyRangePreset("month");
    fetch("/api/settings")
      .then((res) => res.json())
      .then((json) => {
        if (json.status === "success" && json.data.namaUsaha) {
          setNamaUsahaState(json.data.namaUsaha);
        }
      })
      .catch(() => {});
  }, []);

  // Back button & Esc — tutup ReportsModal (atau sub-modal WA preview)
  useBackButton(isOpen, () => {
    if (waPreviewOpen) setWaPreviewOpen(false);
    else onClose();
  });

  const applyRangePreset = (type: RangeType) => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    let startStr: string;

    if (type === "week") {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      startStr = d.toISOString().split("T")[0];
    } else if (type === "month") {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      startStr = d.toISOString().split("T")[0];
    } else {
      startStr = todayStr;
    }

    setStartDate(startStr);
    setEndDate(todayStr);
    setRangeType(type);
  };

  const generateReport = async () => {
    if (!startDate || !endDate) {
      alert("Pilih tanggal mulai dan akhir");
      return;
    }
    setLoading(true);
    try {
      const [motorRes, pengeluaranRes, beliRes] = await Promise.all([
        fetch("/api/motor"),
        fetch("/api/pengeluaran"),
        fetch("/api/beli"),
      ]);

      const motorJson = await motorRes.json();
      const pengeluaranJson = await pengeluaranRes.json();
      const beliJson = await beliRes.json();

      const allMotor: MotorData[] = motorJson.status === "success" ? motorJson.data : [];
      const allPengeluaran: PengeluaranData[] = pengeluaranJson.status === "success" ? pengeluaranJson.data : [];
      const allBeli: MotorBeliData[] = beliJson.status === "success" ? beliJson.data : [];

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const filteredMotor = allMotor.filter((m) => {
        const d = new Date(m.tanggal);
        return d >= start && d <= end;
      });

      const filteredPengeluaran = allPengeluaran.filter((p) => {
        const d = new Date(p.tanggal);
        return d >= start && d <= end;
      });

      // Stok motor: semua motor berstatus "stok" (tidak difilter tanggal — stok aktif saat ini)
      const stokMotor = allBeli.filter((b) => b.status === "stok");

      const totalHargaBeli = filteredMotor.reduce((sum, m) => sum + m.hargaBeli, 0);
      const totalReparasi = filteredMotor.reduce((sum, m) => sum + m.biayaReparasi, 0);
      const totalModal = filteredMotor.reduce((sum, m) => sum + m.totalModal, 0);
      const totalJual = filteredMotor.reduce((sum, m) => sum + m.hargaJual, 0);
      const totalProfit = filteredMotor.reduce((sum, m) => sum + m.untungBersih, 0);
      const totalPengeluaran = filteredPengeluaran.reduce((sum, p) => sum + p.nominal, 0);
      const totalHargaBeliStok = stokMotor.reduce((sum, b) => sum + b.hargaBeli, 0);
      const labaBersih = totalProfit - totalPengeluaran;

      setReportData({
        penjualan: filteredMotor,
        pengeluaran: filteredPengeluaran,
        stokMotor,
        totalHargaBeli,
        totalReparasi,
        totalModal,
        totalJual,
        totalProfit,
        totalPengeluaran,
        totalHargaBeliStok,
        labaBersih,
      });
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Gagal membuat laporan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (!reportData) return;
    document.body.classList.add("printing");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("printing");
    }, 100);
  };

  const prepareWhatsAppMessage = async () => {
    if (!reportData) return;
    const namaUsaha = namaUsahaState;
    const formatDate = (d: string) =>
      new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
    const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

    // HELPER 1: Spasi yang tidak akan dihapus WA (Non-Breaking Space)
    const alignLabel = (text: string, isBold = false) => {
      // Teks terpanjang "Pengeluaran Lain" & "Nilai Stok Aktif" = 16 karakter. Kita patok 17 agar aman.
      const maxLength = 17; 
      const spaces = "\u00A0".repeat(Math.max(0, maxLength - text.length));
      
      // Jika bold true, yang dibold HANYA teksnya, BUKAN spasinya.
      // Ini krusial agar jarak spasi tidak melebar karena format tebal.
      return isBold ? `*${text}*${spaces}` : `${text}${spaces}`;
    };

    // HELPER 2: Spasi indentasi untuk isi list detail
    const indent = "\u00A0\u00A0\u00A0"; 

    const stokSection = reportData.stokMotor.length === 0
      ? "Tidak ada stok aktif."
      : reportData.stokMotor
          .map((m, i) => {
            const restorasiTotal = m.biayaRestorasi || 0;
            const detailLines = m.detailRestorasi && m.detailRestorasi.length > 0
              ? m.detailRestorasi.map((d) => `${indent}  - ${d.nama}: ${rp(d.biaya)}`).join("\n")
              : "";
            const restorasiLine = restorasiTotal > 0
              ? `\n${indent}Restorasi: ${rp(restorasiTotal)}${detailLines ? `\n${detailLines}` : ""}`
              : "";
            return `${i + 1}. *${m.namaMotor}*\n${indent}Beli: ${rp(m.hargaBeli)}${restorasiLine}`;
          })
          .join("\n");

    const message = `*LAPORAN ${namaUsaha.toUpperCase()}*
Periode: ${formatDate(startDate)} s/d ${formatDate(endDate)}

━━━━━━━━━━━━━━━━━━━━━━━━
*RINGKASAN KEUANGAN*
━━━━━━━━━━━━━━━━━━━━━━━━
• ${alignLabel("Unit Terjual")} : ${reportData.penjualan.length} unit
• ${alignLabel("Pembelian Aset")} : ${rp(reportData.totalHargaBeli)}
• ${alignLabel("Biaya Restorasi")} : ${rp(reportData.totalReparasi)}
• ${alignLabel("Total Modal")} : ${rp(reportData.totalModal)}
• ${alignLabel("Akumulasi Jual")} : ${rp(reportData.totalJual)}
• ${alignLabel("Profit Kotor")} : ${rp(reportData.totalProfit)}
• ${alignLabel("Pengeluaran Lain")} : ${rp(reportData.totalPengeluaran)}
• ${alignLabel("Laba Bersih", true)} : *${rp(reportData.labaBersih)}*
• ${alignLabel("Nilai Stok Aktif")} : ${rp(reportData.totalHargaBeliStok)} (${reportData.stokMotor.length} unit)

━━━━━━━━━━━━━━━━━━━━━━━━
*DETAIL PENJUALAN* (${reportData.penjualan.length} unit)
━━━━━━━━━━━━━━━━━━━━━━━━
${
  reportData.penjualan.length === 0
    ? "Tidak ada penjualan."
    : reportData.penjualan
        .map(
          (m, i) => {
            const detailLines = m.detailRestorasi && m.detailRestorasi.length > 0
              ? m.detailRestorasi.map((d) => `${indent}  - ${d.nama}: ${rp(d.biaya)}`).join("\n")
              : "";
            return `${i + 1}. *${m.namaMotor}*
${indent}Tanggal: ${formatDate(m.tanggal)}
${indent}Beli: ${rp(m.hargaBeli)} | Restorasi: ${rp(m.biayaReparasi)}${detailLines ? `\n${detailLines}` : ""}
${indent}Modal: ${rp(m.totalModal)} | Jual: ${rp(m.hargaJual)}
${indent}Profit: *${rp(m.untungBersih)}*`;
          }
        )
        .join("\n\n")
}

━━━━━━━━━━━━━━━━━━━━━━━━
*STOK MOTOR AKTIF* (${reportData.stokMotor.length} unit)
━━━━━━━━━━━━━━━━━━━━━━━━
${stokSection}
${reportData.stokMotor.length > 0 ? `\nTotal Nilai Stok: *${rp(reportData.totalHargaBeliStok)}*` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━
_Dibuat: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}_`.trim();

    setWaMessage(message);
    setWaPreviewOpen(true);
  };

  const sendWhatsApp = () => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((json) => {
        let nomorWa = json.status === "success" ? json.data.nomorWa || "" : "";
        let formattedNumber = nomorWa.trim();
        if (formattedNumber) {
          if (formattedNumber.startsWith("08")) formattedNumber = "+62" + formattedNumber.substring(1);
          else if (formattedNumber.startsWith("628")) formattedNumber = "+" + formattedNumber;
          else if (!formattedNumber.startsWith("+")) formattedNumber = "+62" + formattedNumber;
          window.open(`https://wa.me/${formattedNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(waMessage)}`, "_blank");
        } else {
          window.open(`https://wa.me/?text=${encodeURIComponent(waMessage)}`, "_blank");
        }
        setWaPreviewOpen(false);
      });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[99990] flex items-center justify-center px-4" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
        <div className="relative w-full max-h-[90vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl flex flex-col animate-slide-up overflow-hidden" style={{ maxWidth: "500px" }}>
          
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0 bg-gradient-to-r from-brand-600 to-brand-800">
            <h3 className="font-bold text-lg text-white">Laporan Keuangan</h3>
            <button onClick={onClose} className="p-2 -mr-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-current"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide p-0">
            <div className="p-4 animate-fade-in no-print">
              {!reportData ? (
                <div 
                  className="card p-5"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 ml-1">Periode Waktu</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["week", "month", "custom"] as RangeType[]).map((type) => (
                          <button
                            key={type}
                            onClick={() => switchRangeTab(type)}
                            className={`py-2.5 rounded-xl font-semibold text-sm transition-all ${
                              rangeType === type
                                ? "bg-brand-600 text-white shadow-sm"
                                : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                            }`}
                          >
                            {type === "week" ? "7 Hari" : type === "month" ? "30 Hari" : "Custom"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 ml-1">Dari Tanggal</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => { setStartDate(e.target.value); setRangeType("custom"); }}
                          className="input-field text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 ml-1">Sampai Tanggal</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => { setEndDate(e.target.value); setRangeType("custom"); }}
                          className="input-field text-sm"
                        />
                      </div>
                    </div>

                    <button
                      onClick={generateReport}
                      disabled={loading || !startDate || !endDate}
                      className="btn-primary disabled:opacity-50"
                    >
                      {loading ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Menganalisa...</>
                      ) : (
                        <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-white"><path d="M224,152v56a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V152a8,8,0,0,1,16,0v56H208V152a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,132.69V40a8,8,0,0,0-16,0v92.69L93.66,106.34a8,8,0,0,0-11.32,11.32Z" /></svg> Generate Laporan</>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Toolbar */}
                  <div className="card p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      <strong className="text-gray-800 dark:text-white">{formatDatePrint(startDate)}</strong>
                      {" — "}
                      <strong className="text-gray-800 dark:text-white">{formatDatePrint(endDate)}</strong>
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => setReportData(null)} 
                        className="py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-current">
                          <path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/>
                        </svg>
                        Atur Ulang
                      </button>
                      <button 
                        onClick={downloadPDF} 
                        className="py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-white">
                          <path d="M224,152v56a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V152a8,8,0,0,1,16,0v56H208V152a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,132.69V40a8,8,0,0,0-16,0v92.69L93.66,106.34a8,8,0,0,0-11.32,11.32Z" />
                        </svg>
                        Cetak PDF
                      </button>
                      <button 
                        onClick={prepareWhatsAppMessage} 
                        className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-3.5 h-3.5 fill-white">
                          <path d="M187.58,144.84l-32-16a8,8,0,0,0-8,.5l-14.69,9.8a40.55,40.55,0,0,1-16-16l9.8-14.69a8,8,0,0,0,.5-8l-16-32A8,8,0,0,0,104,64a40,40,0,0,0-40,40,88.1,88.1,0,0,0,88,88,40,40,0,0,0,40-40A8,8,0,0,0,187.58,144.84ZM152,176a72.08,72.08,0,0,1-72-72,24,24,0,0,1,19.29-23.54l11.48,22.95L101,117.11a8,8,0,0,0-.73,7.65,56.53,56.53,0,0,0,30.15,30.15,8,8,0,0,0,7.65-.73l13.7-9.19,22.95,11.48A24,24,0,0,1,152,176ZM128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a88,88,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216l12.47-37.4a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
                        </svg>
                        Kirim WA
                      </button>
                    </div>
                  </div>

                  {/* Summary Cards — 2 kolom */}
                    <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Pembelian Aset (Harga Beli)", value: reportData.totalHargaBeli, accent: "bg-blue-500" },
                      { label: "Biaya Restorasi", value: reportData.totalReparasi, accent: "bg-amber-500" },
                      { label: "Total Modal (Beli + Restorasi)", value: reportData.totalModal, accent: "bg-orange-500" },
                      { label: "Akumulasi Penjualan", value: reportData.totalJual, accent: "bg-emerald-500" },
                      { label: "Profit Kotor", value: reportData.totalProfit, accent: "bg-indigo-500" },
                      { label: "Pengeluaran Lainnya", value: reportData.totalPengeluaran, accent: "bg-rose-500" },
                    ].map((item) => (
                      <div key={item.label} className="card p-3 flex items-center gap-2.5">
                        <div className={`w-1.5 h-10 rounded-full shrink-0 ${item.accent}`} />
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold leading-tight">{item.label}</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 truncate">
                            Rp {(item.value / 1000000).toFixed(1)}Jt
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Laba Bersih */}
                  <div className={`rounded-2xl p-4 flex items-center justify-between shadow-sm ${
                    reportData.labaBersih >= 0
                      ? "bg-gradient-to-r from-green-500 to-emerald-600"
                      : "bg-gradient-to-r from-red-500 to-rose-600"
                  } text-white`}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-white/80">Laba Bersih</p>
                      <p className="text-[10px] text-white/60 mt-0.5">Profit Kotor − Pengeluaran</p>
                    </div>
                    <p className="text-xl font-extrabold">
                      {reportData.labaBersih >= 0 ? "+" : "−"}Rp {Math.abs(reportData.labaBersih).toLocaleString("id-ID")}
                    </p>
                  </div>

                  {/* Nilai Stok Aktif */}
                  <div className="rounded-2xl p-4 flex items-center justify-between shadow-sm bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                        Nilai Stok Aktif ({reportData.stokMotor.length} unit)
                      </p>
                      <p className="text-[10px] text-sky-500 dark:text-sky-500 mt-0.5">Aset inventaris belum terjual</p>
                    </div>
                    <p className="text-lg font-extrabold text-sky-700 dark:text-sky-400">
                      Rp {(reportData.totalHargaBeliStok / 1000000).toFixed(1)}Jt
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="no-print">
        <WhatsAppPreviewModal
          isOpen={waPreviewOpen}
          message={waMessage}
          onClose={() => setWaPreviewOpen(false)}
          onSend={sendWhatsApp}
          onEdit={(newMessage) => setWaMessage(newMessage)}
        />
      </div>

      {/* ====== PRINT LAYOUT — dikelola di PrintReport.tsx ====== */}
      {reportData && (
        <PrintReport
          reportData={reportData}
          namaUsaha={namaUsahaState}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </>
  );
}
