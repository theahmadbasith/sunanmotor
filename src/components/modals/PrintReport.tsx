"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { MotorData, MotorBeliData, PengeluaranData } from "@/types";
import { formatDatePrint, formatDateTable } from "@/lib/utils";

// ==============================================================================
// 1. TYPE DECLARATIONS & INTERFACES
// ==============================================================================
export interface ReportData {
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
}

interface PrintReportProps {
  reportData: ReportData;
  namaUsaha: string;
  startDate: string;
  endDate: string;
}

// ==============================================================================
// 2. HELPER FUNCTIONS
// ==============================================================================
function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "M";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "Jt";
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + "rb";
  return n.toString();
}

// ==============================================================================
// 3. KOMPONEN CHART: BAR CHART (VISUALISASI PROFIT)
// ==============================================================================
function BarChart({ penjualan }: { penjualan: MotorData[] }) {
  if (penjualan.length === 0) return <p className="pr-empty-state">Tidak ada data penjualan</p>;

  const items = penjualan.slice(0, 10);
  const count = items.length;
  const barW = 34;
  const gap = 12;
  const leftPad = 35;
  const rightPad = 15;
  const svgW = leftPad + count * (barW + gap) + rightPad;
  const svgH = 175;
  const chartBottom = 140;
  const chartTop = 20;
  const maxBarH = chartBottom - chartTop;

  const profits = items.map((p) => p.untungBersih);
  const maxAbs = Math.max(...profits.map(Math.abs), 1);
  const gridLines = [chartTop, chartTop + maxBarH * 0.33, chartTop + maxBarH * 0.66, chartBottom];

  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox={`0 0 ${svgW} ${svgH}`} 
      preserveAspectRatio="xMidYMid meet" 
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="barPosGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
        <linearGradient id="barNegGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>

      {gridLines.map((y, idx) => (
        <line
          key={y}
          x1={leftPad - 5}
          y1={y}
          x2={svgW - rightPad}
          y2={y}
          stroke={idx === gridLines.length - 1 ? "#94a3b8" : "#e2e8f0"}
          strokeWidth={idx === gridLines.length - 1 ? 1.5 : 0.8}
          strokeDasharray={idx === gridLines.length - 1 ? "0" : "3,3"}
        />
      ))}

      <text x={2} y={chartTop + 4} fontSize="8px" fill="#64748b" fontWeight="bold">Rp</text>
      <text x={2} y={chartTop + 14} fontSize="7px" fill="#94a3b8">(Jt)</text>

      {items.map((m, i) => {
        const barH = Math.max((Math.abs(m.untungBersih) / maxAbs) * maxBarH, 2);
        const x = leftPad + i * (barW + gap);
        const isNeg = m.untungBersih < 0;
        const barY = isNeg ? chartBottom : chartBottom - barH;
        const label = m.namaMotor.length > 8 ? m.namaMotor.substring(0, 7) + "…" : m.namaMotor;

        return (
          <g key={m.id || i}>
            <rect x={x} y={barY} width={barW} height={barH} fill={isNeg ? "url(#barNegGradient)" : "url(#barPosGradient)"} rx={2.5} />
            <text x={x + barW / 2} y={isNeg ? barY + barH + 10 : barY - 4} fontSize="8px" fill={isNeg ? "#b91c1c" : "#1e40af"} textAnchor="middle" fontWeight="800">
              {fmtShort(m.untungBersih)}
            </text>
            <text x={x + barW / 2} y={chartBottom + 12} fontSize="7.5px" fill="#475569" textAnchor="middle" fontWeight="600" transform={count > 6 ? `rotate(-25, ${x + barW / 2}, ${chartBottom + 12})` : ""}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ==============================================================================
// 4. KOMPONEN CHART: PIE CHART (RASIO KAS)
// ==============================================================================
function PieChart({ totalModal, totalProfit, totalPengeluaran }: { totalModal: number; totalProfit: number; totalPengeluaran: number }) {
  const positifProfit = Math.max(0, totalProfit);
  const safeTotal = (totalModal + positifProfit + totalPengeluaran) || 1;

  const segments = [
    { pct: (totalModal / safeTotal) * 100, fill: "#f97316", label: "Pokok Motor Terjual", value: totalModal },
    { pct: (positifProfit / safeTotal) * 100, fill: "#10b981", label: "Profit Kotor", value: positifProfit },
    { pct: (totalPengeluaran / safeTotal) * 100, fill: "#ef4444", label: "Pengeluaran Lainnya", value: totalPengeluaran },
  ];

  const cx = 75, cy = 75, r = 60, ri = 35;
  let currentAngle = -90;

  const arcs = segments.map((seg) => {
    if (seg.pct <= 0) return { ...seg, d: "" };
    if (seg.pct >= 99.9) return { ...seg, d: `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z` };
    const angle = (seg.pct / 100) * 360;
    const start = currentAngle;
    const end = currentAngle + angle;
    currentAngle = end;
    const s = start * (Math.PI / 180);
    const e = end * (Math.PI / 180);
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const xi1 = cx + ri * Math.cos(s), yi1 = cy + ri * Math.sin(s);
    const xi2 = cx + ri * Math.cos(e), yi2 = cy + ri * Math.sin(e);
    const large = angle > 180 ? 1 : 0;
    return {
      ...seg,
      d: `M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ri} ${ri} 0 ${large} 0 ${xi1} ${yi1} Z`,
    };
  });

  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox="0 0 310 150" 
      style={{ display: "block", overflow: "visible" }}
    >
      {arcs.map((arc) => arc.d ? <path key={arc.label} d={arc.d} fill={arc.fill} /> : null)}
      <text x={cx} y={cy - 2} fontSize="11px" fill="#0f172a" textAnchor="middle" fontWeight="800">Kas</text>
      <text x={cx} y={cy + 9} fontSize="8.5px" fill="#64748b" textAnchor="middle" fontWeight="600">Rasio</text>

      {arcs.map((arc, i) => (
        <g key={arc.label} transform={`translate(155, ${20 + i * 38})`}>
          <rect x={0} y={0} width={11} height={11} rx={2} fill={arc.fill} />
          <text x={16} y={9} fontSize="9px" fill="#334155" fontWeight="700">{arc.label}</text>
          <text x={16} y={22} fontSize="9px" fill="#0f172a" fontWeight="900">{fmtShort(arc.value)}</text>
        </g>
      ))}
    </svg>
  );
}

// ==============================================================================
// 5. MAIN RENDER COMPONENT
// ==============================================================================
export default function PrintReport({ reportData, namaUsaha, startDate, endDate }: PrintReportProps) {
  const rp = (n: number) => n.toLocaleString("id-ID");

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!reportData) return null;

  const content = (
    <>
      <div id="print-section" className="pr-wrapper">
        <div className="pr-container">

          {/* --- HEADER KOP SURAT --- */}
          <header className="pr-header pr-avoid-break">
            <div className="pr-header-left">
              <h1 className="pr-company-name">{namaUsaha}</h1>
              <p className="pr-doc-title">Buku Besar Keuangan &amp; Transaksi Unit</p>
            </div>
            <div className="pr-header-right">
              <p className="pr-period-label">Periode Pembukuan</p>
              <p className="pr-period-date">{formatDatePrint(startDate)} &ndash; {formatDatePrint(endDate)}</p>
            </div>
          </header>

          {/* --- KOTAK METRIK (GRID 2 KOLOM) --- */}
          <div className="pr-summary-grid pr-avoid-break">
            {[
              { label: "Total Pembelian Aset (Harga Beli)", value: reportData.totalHargaBeli, cls: "pr-box-blue" },
              { label: "Total Biaya Restorasi", value: reportData.totalReparasi, cls: "pr-box-amber" },
              { label: "Total Modal Dikeluarkan (Beli + Restorasi)", value: reportData.totalModal, cls: "pr-box-orange" },
              { label: "Akumulasi Penjualan", value: reportData.totalJual, cls: "pr-box-emerald" },
              { label: "Profit Kotor (Jual − Modal)", value: reportData.totalProfit, cls: "pr-box-indigo" },
              { label: "Pengeluaran Lainnya", value: reportData.totalPengeluaran, cls: "pr-box-rose" },
            ].map((item) => (
              <div key={item.label} className={`pr-summary-card ${item.cls}`}>
                <p className="pr-summary-label">{item.label}</p>
                <p className="pr-summary-value">Rp {rp(item.value)}</p>
              </div>
            ))}
          </div>

          {/* --- KOTAK LABA BERSIH KESELURUHAN --- */}
          <div className={`pr-net-profit-box pr-avoid-break ${reportData.labaBersih >= 0 ? "pr-net-positive" : "pr-net-negative"}`}>
            <div className="pr-net-texts">
              <span className="pr-net-title">Laba Bersih (Net Income)</span>
              <span className="pr-net-subtitle">Profit Kotor − Pengeluaran Lainnya</span>
            </div>
            <span className="pr-net-value">
              {reportData.labaBersih >= 0 ? "+" : "−"} Rp {rp(Math.abs(reportData.labaBersih))}
            </span>
          </div>

          {/* --- KOTAK NILAI STOK AKTIF --- */}
          <div className="pr-stok-box pr-avoid-break">
            <div className="pr-net-texts">
              <span className="pr-stok-title">Nilai Stok Motor Aktif ({reportData.stokMotor.length} unit belum terjual)</span>
              <span className="pr-stok-subtitle">Aset inventaris yang masih dimiliki — belum terealisasi sebagai pendapatan</span>
            </div>
            <span className="pr-stok-value">Rp {rp(reportData.totalHargaBeliStok)}</span>
          </div>

          {/* --- LAYOUT GRAFIK --- */}
          <div className="pr-charts-container pr-avoid-break">
            <div className="pr-chart-left">
              <h3 className="pr-section-title">📊 Performa Profit per Unit (Top 10)</h3>
              <div className="pr-chart-svg-wrap">
                <BarChart penjualan={reportData.penjualan} />
              </div>
            </div>
            <div className="pr-chart-right">
              <h3 className="pr-section-title">🥧 Distribusi Arus Kas</h3>
              <div className="pr-chart-svg-wrap">
                <PieChart
                  totalModal={reportData.totalModal}
                  totalProfit={reportData.totalProfit}
                  totalPengeluaran={reportData.totalPengeluaran}
                />
              </div>
            </div>
          </div>

          {/* --- TABEL 1: DAFTAR PENJUALAN --- */}
          <div className="pr-table-section">
            <h3 className="pr-section-title-large pr-avoid-break">
              Daftar Rincian Transaksi Penjualan ({reportData.penjualan.length} Unit)
            </h3>
            {reportData.penjualan.length > 0 ? (
              <table className="pr-data-table">
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="pr-text-center">No</th>
                    <th className="pr-text-center">Pic</th>
                    <th>Tanggal</th>
                    <th>Kendaraan</th>
                    <th className="pr-text-right">Harga Beli</th>
                    <th className="pr-text-right">Restorasi</th>
                    <th className="pr-text-right">Modal</th>
                    <th className="pr-text-right">Harga Jual</th>
                    <th className="pr-text-right pr-text-emerald">Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.penjualan.map((m, i) => (
                    <tr key={m.id || i}>
                      <td className="pr-text-center pr-font-bold pr-text-gray500">{i + 1}</td>
                      <td className="pr-text-center pr-cell-foto">
                        {m.fotos?.length > 0 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.fotos[0]} alt="Unit" className="pr-table-img" loading="eager" />
                        ) : (
                          <div className="pr-table-img-placeholder">-</div>
                        )}
                      </td>
                      <td className="pr-cell-nowrap">{formatDateTable(m.tanggal)}</td>
                      <td className="pr-font-bold pr-text-gray800 pr-cell-wrap">{m.namaMotor}</td>
                      <td className="pr-cell-money">{rp(m.hargaBeli)}</td>
                      <td className="pr-cell-restorasi">
                        <span className="pr-cell-money-inline">{rp(m.biayaReparasi)}</span>
                        {m.detailRestorasi && m.detailRestorasi.length > 0 && (
                          <div className="pr-restorasi-detail">
                            {m.detailRestorasi.map((d, di) => (
                              <div key={di} className="pr-restorasi-item">
                                <span className="pr-restorasi-nama">{d.nama}</span>
                                <span className="pr-restorasi-biaya">{rp(d.biaya)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="pr-cell-money">{rp(m.totalModal)}</td>
                      <td className="pr-cell-money">{rp(m.hargaJual)}</td>
                      <td className={`pr-cell-money pr-font-bold ${m.untungBersih >= 0 ? "pr-text-emerald" : "pr-text-rose"}`}>
                        {rp(m.untungBersih)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="pr-text-right pr-font-bold" style={{ paddingRight: "12px" }}>
                      AKUMULASI TOTAL PENJUALAN
                    </td>
                    <td className="pr-cell-money pr-font-bold">{rp(reportData.totalHargaBeli)}</td>
                    <td className="pr-cell-money pr-font-bold">{rp(reportData.totalReparasi)}</td>
                    <td className="pr-cell-money pr-font-bold">{rp(reportData.totalModal)}</td>
                    <td className="pr-cell-money pr-font-bold">{rp(reportData.totalJual)}</td>
                    <td className="pr-cell-money pr-font-black pr-text-emerald" style={{ fontSize: "8.5pt" }}>
                      {rp(reportData.totalProfit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div className="pr-empty-table pr-avoid-break">Belum ada transaksi penjualan yang tercatat.</div>
            )}
          </div>

          {/* --- TABEL 2: PENGELUARAN --- */}
          <div className="pr-table-section" style={{ marginTop: "5mm" }}>
            <h3 className="pr-section-title-large pr-avoid-break">
              Daftar Pengeluaran Lainnya ({reportData.pengeluaran.length} Catatan)
            </h3>
            {reportData.pengeluaran.length > 0 ? (
              <table className="pr-data-table">
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "54%" }} />
                  <col style={{ width: "22%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="pr-text-center">No</th>
                    <th className="pr-text-center">Nota</th>
                    <th>Tanggal</th>
                    <th>Deskripsi &amp; Uraian Keperluan</th>
                    <th className="pr-text-right">Nominal (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.pengeluaran.map((p, i) => (
                    <tr key={p.id || i}>
                      <td className="pr-text-center pr-font-bold pr-text-gray500">{i + 1}</td>
                      <td className="pr-text-center pr-cell-foto">
                        {p.fotos && p.fotos.length > 0 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.fotos[0]} alt="Nota" className="pr-table-img" loading="eager" />
                        ) : (
                          <div className="pr-table-img-placeholder">-</div>
                        )}
                      </td>
                      <td className="pr-cell-nowrap">{formatDateTable(p.tanggal)}</td>
                      <td className="pr-text-gray800 pr-cell-wrap">{p.keperluan}</td>
                      <td className="pr-cell-money pr-font-bold pr-text-rose">{rp(p.nominal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="pr-text-right pr-font-bold" style={{ paddingRight: "12px" }}>
                      AKUMULASI PENGELUARAN OPEX
                    </td>
                    <td className="pr-cell-money pr-font-black pr-text-rose" style={{ fontSize: "8.5pt" }}>
                      {rp(reportData.totalPengeluaran)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div className="pr-empty-table pr-avoid-break">Tidak ada catatan pengeluaran lainnya.</div>
            )}
          </div>

          {/* --- TABEL 3: STOK MOTOR AKTIF --- */}
          <div className="pr-table-section" style={{ marginTop: "5mm" }}>
            <h3 className="pr-section-title-large pr-avoid-break">
              Daftar Stok Motor Aktif — Belum Terjual ({reportData.stokMotor.length} Unit)
            </h3>
            {reportData.stokMotor.length > 0 ? (
              <table className="pr-data-table">
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "37%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "22%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="pr-text-center">No</th>
                    <th className="pr-text-center">Pic</th>
                    <th>Tanggal Beli</th>
                    <th>Nama Kendaraan</th>
                    <th className="pr-text-right">Harga Beli (Rp)</th>
                    <th className="pr-text-right">Restorasi (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.stokMotor.map((m, i) => (
                    <tr key={m.id || i}>
                      <td className="pr-text-center pr-font-bold pr-text-gray500">{i + 1}</td>
                      <td className="pr-text-center pr-cell-foto">
                        {m.fotos?.length > 0 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.fotos[0]} alt="Unit" className="pr-table-img" loading="eager" />
                        ) : (
                          <div className="pr-table-img-placeholder">-</div>
                        )}
                      </td>
                      <td className="pr-cell-nowrap">{formatDateTable(m.tanggal)}</td>
                      <td className="pr-font-bold pr-text-gray800 pr-cell-wrap">{m.namaMotor}</td>
                      <td className="pr-cell-money pr-font-bold pr-text-blue">{rp(m.hargaBeli)}</td>
                      <td className="pr-cell-restorasi">
                        {(m.biayaRestorasi || 0) > 0 ? (
                          <>
                            <span className="pr-cell-money-inline pr-text-amber">{rp(m.biayaRestorasi || 0)}</span>
                            {m.detailRestorasi && m.detailRestorasi.length > 0 && (
                              <div className="pr-restorasi-detail">
                                {m.detailRestorasi.map((d, di) => (
                                  <div key={di} className="pr-restorasi-item">
                                    <span className="pr-restorasi-nama">{d.nama}</span>
                                    <span className="pr-restorasi-biaya">{rp(d.biaya)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="pr-cell-money-inline pr-text-gray500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="pr-text-right pr-font-bold" style={{ paddingRight: "12px" }}>
                      TOTAL NILAI STOK AKTIF
                    </td>
                    <td className="pr-cell-money pr-font-black pr-text-blue" style={{ fontSize: "8.5pt" }}>
                      {rp(reportData.totalHargaBeliStok)}
                    </td>
                    <td className="pr-cell-money pr-font-black pr-text-amber" style={{ fontSize: "8.5pt" }}>
                      {rp(reportData.stokMotor.reduce((s, m) => s + (m.biayaRestorasi || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div className="pr-empty-table pr-avoid-break">Tidak ada stok motor aktif.</div>
            )}
          </div>

          {/* --- FOOTER LAPORAN --- */}
          <div className="pr-footer pr-avoid-break">
            <div>
              Dihasilkan melalui sistem database otomatis: <strong>{namaUsaha} System</strong>
            </div>
            <div>
              Tercetak pada: {new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" })}
            </div>
          </div>

        </div>
      </div>

      <style>{`

        /* ======================================================
           SCREEN: SEMBUNYIKAN SECARA VISUAL, JANGAN PAKAI DISPLAY NONE
           Trik ini memaksa Safari untuk mendownload Gambar & merender SVG 
           dari awal, sehingga siap saat Cmd+P ditekan.
        ====================================================== */
        @media screen {
          .pr-wrapper {
            position: fixed !important;
            top: -9999px !important;
            left: -9999px !important;
            width: 1px !important;
            height: 1px !important;
            overflow: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -999 !important;
          }
        }

        /* ======================================================
           PRINT SAFARI/iOS BULLETPROOF CSS
        ====================================================== */
        @media print {

          @page {
            size: A4 portrait;
            /* Kita menggunakan margin default OS untuk menghandle auto-pagination yang sehat */
            margin: 10mm 8mm !important; 
          }

          /* Normalkan body dan html untuk Pagination. HARUS STATIC. */
          html, body {
            width: 100% !important;
            height: auto !important;
            min-height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            position: static !important; 
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* 
           * Trik mematikan layout Next.js tanpa menghapus tree DOM
           * Menyembunyikan semua elemen kecuali yang ber-ID #print-section
           */
          body > :not(#print-section) {
            display: none !important;
          }

          .pr-wrapper {
            display: block !important;
            position: static !important; /* KUNCI SAFARI BISA PINDAH HALAMAN 2 */
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            visibility: visible !important;
            opacity: 1 !important;
          }

          .pr-container {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 !important; /* Margin dihandle oleh @page */
            color: #000 !important;
            font-family: Arial, Helvetica, sans-serif !important;
            background: white !important;
          }

          * {
            box-sizing: border-box !important;
          }

          /* ===== PAGE BREAK CONTROLS ===== */
          .pr-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          h1, h2, h3 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }

          /* ===== HEADER KOP ===== */
          .pr-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            background: #1e3a8a !important;
            color: white !important;
            padding: 3mm 4mm !important;
            border-radius: 1.5mm !important;
            margin-bottom: 3mm !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .pr-header-right { text-align: right; }
          .pr-company-name { font-size: 14pt !important; font-weight: 900 !important; margin: 0 !important; text-transform: uppercase !important; color: white !important; }
          .pr-doc-title { font-size: 7pt !important; font-weight: 600 !important; margin: 1mm 0 0 !important; opacity: 0.9 !important; color: white !important; }
          .pr-period-label { font-size: 6pt !important; opacity: 0.8 !important; margin: 0 0 0.5mm !important; text-transform: uppercase !important; color: white !important; }
          .pr-period-date { font-size: 8pt !important; font-weight: 800 !important; margin: 0 !important; color: white !important; }

          /* ===== SUMMARY GRID ===== */
          .pr-summary-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 2mm !important;
            margin-bottom: 2.5mm !important;
            width: 100% !important;
          }

          .pr-summary-card {
            padding: 2mm 2.5mm !important;
            border-radius: 1.5mm !important;
            border: 1px solid #e2e8f0 !important;
            border-left-width: 2.5mm !important;
            background: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .pr-summary-label { font-size: 5.5pt !important; text-transform: uppercase !important; font-weight: 800 !important; margin: 0 0 1mm !important; color: #64748b !important; line-height: 1.2 !important; }
          .pr-summary-value { font-size: 8pt !important; font-weight: 900 !important; margin: 0 !important; color: #0f172a !important; }
          .pr-box-blue   { border-left-color: #3b82f6 !important; }
          .pr-box-amber  { border-left-color: #f59e0b !important; }
          .pr-box-orange { border-left-color: #f97316 !important; }
          .pr-box-emerald{ border-left-color: #10b981 !important; }
          .pr-box-indigo { border-left-color: #6366f1 !important; }
          .pr-box-rose   { border-left-color: #e11d48 !important; }

          /* ===== NET PROFIT BOX ===== */
          .pr-net-profit-box {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 2.5mm 3.5mm !important;
            border-radius: 1.5mm !important;
            margin-bottom: 2mm !important;
            border: 2px solid !important;
            width: 100% !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .pr-net-positive { background: #f0fdf4 !important; border-color: #10b981 !important; }
          .pr-net-negative { background: #fff1f2 !important; border-color: #e11d48 !important; }
          .pr-net-texts { display: flex !important; flex-direction: column !important; }
          .pr-net-title { font-size: 9pt !important; font-weight: 900 !important; text-transform: uppercase !important; line-height: 1.2 !important; }
          .pr-net-subtitle { font-size: 6pt !important; opacity: 0.8 !important; font-weight: 600 !important; margin-top: 0.5mm !important; }
          .pr-net-value { font-size: 10pt !important; font-weight: 900 !important; white-space: nowrap !important; }
          .pr-net-positive .pr-net-value, .pr-net-positive .pr-net-title { color: #047857 !important; }
          .pr-net-negative .pr-net-value, .pr-net-negative .pr-net-title { color: #be123c !important; }

          /* ===== STOK BOX ===== */
          .pr-stok-box {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 2.5mm 3.5mm !important;
            border-radius: 1.5mm !important;
            margin-bottom: 2.5mm !important;
            border: 2px solid #0ea5e9 !important;
            background: #f0f9ff !important;
            width: 100% !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .pr-stok-title { font-size: 9pt !important; font-weight: 900 !important; text-transform: uppercase !important; line-height: 1.2 !important; color: #0369a1 !important; }
          .pr-stok-subtitle { font-size: 6pt !important; opacity: 0.8 !important; font-weight: 600 !important; margin-top: 0.5mm !important; color: #0369a1 !important; }
          .pr-stok-value { font-size: 10pt !important; font-weight: 900 !important; white-space: nowrap !important; color: #0369a1 !important; }

          /* ===== CHARTS — Side by Side ===== */
          .pr-charts-container {
            display: flex !important;
            flex-direction: row !important;
            gap: 3mm !important;
            width: 100% !important;
            margin-bottom: 3.5mm !important;
          }
          .pr-chart-left {
            flex: 1.5 !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 1.5mm !important;
            padding: 2mm !important;
            background: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .pr-chart-right {
            flex: 1 !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 1.5mm !important;
            padding: 2mm !important;
            background: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .pr-section-title { font-size: 6.5pt !important; font-weight: 800 !important; color: #1e3a8a !important; border-bottom: 1.5px solid #93c5fd !important; padding-bottom: 0.8mm !important; margin: 0 0 1.5mm !important; text-transform: uppercase !important; }
          .pr-chart-svg-wrap {
            width: 100% !important;
            height: 42mm !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .pr-chart-svg-wrap svg { width: 100% !important; height: 100% !important; }

          /* ===== TABLES ===== */
          .pr-table-section { width: 100% !important; margin-bottom: 5mm !important; }
          .pr-section-title-large { font-size: 8pt !important; font-weight: 900 !important; color: #1e3a8a !important; margin: 0 0 2mm !important; text-transform: uppercase !important; border-left: 2.5mm solid #1e3a8a !important; padding-left: 2.5mm !important; }
          
          .pr-data-table {
            width: 100% !important;
            max-width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            font-size: 5.5pt !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          
          .pr-data-table th {
            background: #1e3a8a !important; color: white !important; font-weight: 800 !important; text-transform: uppercase !important; font-size: 5pt !important; padding: 1.8mm 1mm !important; border: 1px solid #1e3a8a !important; text-align: left !important; vertical-align: middle !important; line-height: 1.2 !important; word-wrap: break-word !important; overflow-wrap: break-word !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          
          .pr-data-table td {
            padding: 1.2mm 1mm !important; border: 1px solid #cbd5e1 !important; color: #1e293b !important; vertical-align: middle !important; font-size: 5.5pt !important; line-height: 1.3 !important;
          }
          
          .pr-data-table tbody tr:nth-child(even) { background: #f8fafc !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          .pr-data-table tfoot td {
            background: #eff6ff !important; border-top: 2px solid #1e3a8a !important; padding: 1.8mm 1mm !important; font-weight: 800 !important; font-size: 5.5pt !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }

          /* ===== UTILITY CLASSES ===== */
          .pr-text-center   { text-align: center !important; }
          .pr-text-right    { text-align: right !important; }
          .pr-text-emerald  { color: #059669 !important; }
          .pr-text-rose     { color: #e11d48 !important; }
          .pr-text-blue     { color: #1d4ed8 !important; }
          .pr-text-amber    { color: #b45309 !important; }
          .pr-font-bold     { font-weight: 700 !important; }
          .pr-font-black    { font-weight: 900 !important; }
          .pr-text-gray800  { color: #1e293b !important; }
          .pr-text-gray500  { color: #64748b !important; }

          .pr-cell-wrap { word-wrap: break-word !important; overflow-wrap: break-word !important; white-space: normal !important; }
          .pr-cell-money { text-align: right !important; white-space: nowrap !important; font-family: 'Courier New', monospace !important; font-weight: 700 !important; font-size: 5.5pt !important; padding-right: 1.5mm !important; }
          .pr-cell-money-inline { display: block !important; text-align: right !important; font-family: 'Courier New', monospace !important; font-weight: 700 !important; font-size: 5.5pt !important; }
          .pr-cell-nowrap { white-space: nowrap !important; font-size: 5pt !important; color: #475569 !important; font-weight: 600 !important; }

          /* ===== RESTORASI DETAIL IN TABLE ===== */
          .pr-cell-restorasi { text-align: right !important; vertical-align: top !important; padding: 1.2mm 1mm !important; border: 1px solid #cbd5e1 !important; }
          .pr-restorasi-detail { margin-top: 1mm !important; border-top: 0.5px solid #fde68a !important; padding-top: 0.8mm !important; }
          .pr-restorasi-item { display: flex !important; justify-content: space-between !important; align-items: baseline !important; gap: 1mm !important; margin-bottom: 0.5mm !important; }
          .pr-restorasi-nama { font-size: 4.5pt !important; color: #92400e !important; font-weight: 600 !important; text-align: left !important; flex: 1 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 60% !important; }
          .pr-restorasi-biaya { font-size: 4.5pt !important; color: #b45309 !important; font-weight: 700 !important; font-family: 'Courier New', monospace !important; white-space: nowrap !important; flex-shrink: 0 !important; }
          
          .pr-cell-foto { padding: 0.8mm !important; text-align: center !important; vertical-align: middle !important; }
          .pr-table-img { width: 22px !important; height: 22px !important; object-fit: cover !important; border-radius: 1mm !important; display: block !important; margin: 0 auto !important; border: 1px solid #cbd5e1 !important; }
          .pr-table-img-placeholder { display: block !important; width: 22px !important; height: 22px !important; margin: 0 auto !important; background: #e2e8f0 !important; border-radius: 1mm !important; font-size: 5px !important; color: #94a3b8 !important; font-weight: bold !important; border: 1px dashed #cbd5e1 !important; line-height: 22px !important; text-align: center !important; }

          .pr-empty-table { background: #f8fafc !important; border: 1px dashed #cbd5e1 !important; padding: 3mm !important; text-align: center !important; color: #64748b !important; font-size: 7pt !important; font-weight: 600 !important; border-radius: 1.5mm !important; }
          .pr-empty-state { font-size: 7pt !important; color: #64748b !important; text-align: center !important; }

          /* ===== FOOTER ===== */
          .pr-footer { display: flex !important; justify-content: space-between !important; align-items: center !important; margin-top: 4mm !important; padding-top: 2mm !important; border-top: 1px solid #cbd5e1 !important; font-size: 5.5pt !important; color: #64748b !important; }
        }
      `}</style>
    </>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
