/**
 * GET /api/dashboard
 */

import { NextResponse } from "next/server";
import { readSheet, ensureSheetExists } from "@/lib/google";
import { SHEET_NAMES, SHEET_MOTOR_COLS, SHEET_PENGELUARAN_COLS, SHEET_MOTOR_BELI_COLS } from "@/types";
import type { DashboardData, RecentTransaction, ApiResponse } from "@/types";
import { parseDateFromSheet, parseSheetNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await Promise.all([
      ensureSheetExists(SHEET_NAMES.MOTOR),
      ensureSheetExists(SHEET_NAMES.PENGELUARAN),
      ensureSheetExists(SHEET_NAMES.MOTOR_BELI),
    ]);

    const [motorRows, pengeluaranRows, beliRows] = await Promise.all([
      readSheet(SHEET_NAMES.MOTOR),
      readSheet(SHEET_NAMES.PENGELUARAN),
      readSheet(SHEET_NAMES.MOTOR_BELI),
    ]);

    const motorData = motorRows.slice(1);
    const pengeluaranData = pengeluaranRows.slice(1);
    const beliData = beliRows.slice(1);

    // Hitung penjualan
    let totalKeuntungan = 0;
    let totalModal = 0;
    let totalHargaJual = 0;
    const motorTransactions: RecentTransaction[] = [];

    for (const row of motorData) {
      if (!row[SHEET_MOTOR_COLS.ID]) continue;
      const untung = parseSheetNumber(row[SHEET_MOTOR_COLS.UNTUNG_BERSIH]);
      const modal = parseSheetNumber(row[SHEET_MOTOR_COLS.TOTAL_MODAL]);
      const hargaJual = parseSheetNumber(row[SHEET_MOTOR_COLS.HARGA_JUAL]);
      totalKeuntungan += untung;
      totalModal += modal;
      totalHargaJual += hargaJual;

      motorTransactions.push({
        id: row[SHEET_MOTOR_COLS.ID],
        type: "income",
        title: `Terjual: ${row[SHEET_MOTOR_COLS.NAMA_MOTOR]}`,
        amount: hargaJual,
        date: parseDateFromSheet(row[SHEET_MOTOR_COLS.TANGGAL] || ""),
        detail: `Untung: Rp ${untung.toLocaleString("id-ID")}`,
        fotos: row[SHEET_MOTOR_COLS.FOTOS]
          ? row[SHEET_MOTOR_COLS.FOTOS].split(",").map((u: string) => u.trim()).filter(Boolean)
          : [],
      });
    }

    // Hitung pengeluaran
    let totalPengeluaran = 0;
    const pengeluaranTransactions: RecentTransaction[] = [];

    for (const row of pengeluaranData) {
      if (!row[SHEET_PENGELUARAN_COLS.ID]) continue;
      const nominal = parseSheetNumber(row[SHEET_PENGELUARAN_COLS.NOMINAL]);
      totalPengeluaran += nominal;

      pengeluaranTransactions.push({
        id: row[SHEET_PENGELUARAN_COLS.ID],
        type: "expense",
        title: row[SHEET_PENGELUARAN_COLS.KEPERLUAN],
        amount: nominal,
        date: parseDateFromSheet(row[SHEET_PENGELUARAN_COLS.TANGGAL] || ""),
        fotos: row[SHEET_PENGELUARAN_COLS.FOTOS]
          ? row[SHEET_PENGELUARAN_COLS.FOTOS].split(",").map((u: string) => u.trim()).filter(Boolean)
          : [],
      });
    }

    // Hitung stok (motor yang belum terjual) + totalHargaBeliStok
    const beliTransactions: RecentTransaction[] = [];
    let totalStok = 0;
    let totalHargaBeliStok = 0;

    for (const row of beliData) {
      if (!row[SHEET_MOTOR_BELI_COLS.ID]) continue;
      const status = row[SHEET_MOTOR_BELI_COLS.STATUS] || "stok";
      const hargaBeli = parseSheetNumber(row[SHEET_MOTOR_BELI_COLS.HARGA_BELI]);
      const biayaRestorasi = parseSheetNumber(row[SHEET_MOTOR_BELI_COLS.BIAYA_RESTORASI] || "0");

      // Parse detail restorasi
      let detailRestorasi: import("@/types").DetailRestorasi[] = [];
      const rawDetail = row[SHEET_MOTOR_BELI_COLS.DETAIL_RESTORASI] || "";
      if (rawDetail) {
        try { detailRestorasi = JSON.parse(rawDetail); } catch { detailRestorasi = []; }
      }

      if (status === "stok") {
        totalStok++;
        totalHargaBeliStok += hargaBeli;
      }

      const namaMotor = row[SHEET_MOTOR_BELI_COLS.NAMA_MOTOR] || "";
      beliTransactions.push({
        id: row[SHEET_MOTOR_BELI_COLS.ID],
        type: "beli",
        title: `Beli: ${namaMotor}`,
        amount: hargaBeli,
        date: parseDateFromSheet(row[SHEET_MOTOR_BELI_COLS.TANGGAL] || ""),
        detail: status === "terjual" ? "Sudah terjual" : "Stok",
        fotos: row[SHEET_MOTOR_BELI_COLS.FOTOS]
          ? row[SHEET_MOTOR_BELI_COLS.FOTOS].split(",").map((u: string) => u.trim()).filter(Boolean)
          : [],
        detailRestorasi,
        biayaRestorasi,
        namaMotor,
      });
    }

    // Saldo = modalAwal + totalHargaJual - totalModal - totalPengeluaran - totalHargaBeliStok
    // totalHargaBeliStok: akumulasi harga beli motor yang belum terjual (mengurangi saldo)
    let modalAwal = 0;
    try {
      const { getAllSettings } = await import("@/lib/google");
      const raw = await getAllSettings();
      modalAwal = Number(raw.modalAwal) || 0;
    } catch { /* fallback 0 */ }

    const saldo = modalAwal + totalHargaJual - totalModal - totalPengeluaran - totalHargaBeliStok;

    // Gabung & urutkan 15 transaksi terbaru
    const allTransactions = [...motorTransactions, ...pengeluaranTransactions, ...beliTransactions];
    allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const recent = allTransactions.slice(0, 15);

    const dashboardData: DashboardData = {
      saldo,
      totalKeuntungan,
      totalPengeluaran,
      totalModal,
      totalHargaJual,
      totalMotor: motorData.filter((r) => r[SHEET_MOTOR_COLS.ID]).length,
      totalStok,
      totalHargaBeliStok,
      recent,
    };

    return NextResponse.json({ status: "success", data: dashboardData } satisfies ApiResponse<DashboardData>);
  } catch (error) {
    console.error("[API/dashboard] Error:", error);
    const message = error instanceof Error ? error.message : "Terjadi kesalahan server";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}
