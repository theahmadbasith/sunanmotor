/**
 * POST /api/settings/setup-sheet - Setup semua sheet yang diperlukan
 * - Buat sheet jika belum ada
 * - Perbaiki header jika tidak sesuai (tanpa merusak data)
 * - Terapkan styling header di semua sheet
 */

import { NextResponse } from "next/server";
import { setupSheet } from "@/lib/google";
import { SHEET_NAMES, type ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const sheets = [
      SHEET_NAMES.PENGATURAN,
      SHEET_NAMES.MOTOR_BELI,
      SHEET_NAMES.MOTOR,
      SHEET_NAMES.PENGELUARAN,
    ];

    const results: { sheet: string; action: string; detail: string }[] = [];

    for (const sheetName of sheets) {
      const result = await setupSheet(sheetName);
      results.push({ sheet: sheetName, ...result });
    }

    const summary = results.map((r) => `${r.sheet}: ${r.detail}`).join(" | ");

    return NextResponse.json({
      status: "success",
      message: `Setup selesai. ${summary}`,
      data: results,
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/settings/setup-sheet] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal setup sheet";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}
