/**
 * GET  /api/beli  - Ambil semua data pembelian motor (stok)
 * POST /api/beli  - Catat pembelian motor baru
 * PATCH /api/beli - Update biaya restorasi pada record beli
 * DELETE /api/beli - Hapus data pembelian motor
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readSheet, appendToSheet, ensureSheetExists, uploadImageViaAppsScript, getSheetsClient, ensureSubfolderExists,
} from "@/lib/google";
import {
  SHEET_NAMES, SHEET_MOTOR_BELI_COLS,
  type MotorBeliData, type SubmitMotorBeliPayload, type UpdateRestorasiPayload, type ApiResponse, type DetailRestorasi,
} from "@/types";
import { generateId, isValidBase64Image, formatDateForSheet, parseDateFromSheet } from "@/lib/utils";
import { parseSheetNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

// ============================================================
// GET
// ============================================================
export async function GET() {
  try {
    await ensureSheetExists(SHEET_NAMES.MOTOR_BELI);
    const rows = await readSheet(SHEET_NAMES.MOTOR_BELI);

    const data: MotorBeliData[] = rows
      .slice(1)
      .filter((row) => row[SHEET_MOTOR_BELI_COLS.ID])
      .map((row) => {
        // Parse detail restorasi dari JSON string di sheet
        let detailRestorasi: DetailRestorasi[] = [];
        const rawDetail = row[SHEET_MOTOR_BELI_COLS.DETAIL_RESTORASI] || "";
        if (rawDetail) {
          try { detailRestorasi = JSON.parse(rawDetail); } catch { detailRestorasi = []; }
        }
        return {
          id: row[SHEET_MOTOR_BELI_COLS.ID] || "",
          tanggal: parseDateFromSheet(row[SHEET_MOTOR_BELI_COLS.TANGGAL] || ""),
          namaMotor: row[SHEET_MOTOR_BELI_COLS.NAMA_MOTOR] || "",
          hargaBeli: parseSheetNumber(row[SHEET_MOTOR_BELI_COLS.HARGA_BELI]),
          fotos: row[SHEET_MOTOR_BELI_COLS.FOTOS]
            ? row[SHEET_MOTOR_BELI_COLS.FOTOS].split(",").map((u) => u.trim()).filter(Boolean)
            : [],
          folderId: row[SHEET_MOTOR_BELI_COLS.FOLDER_ID] || "",
          status: (row[SHEET_MOTOR_BELI_COLS.STATUS] as "stok" | "terjual") || "stok",
          idJual: row[SHEET_MOTOR_BELI_COLS.ID_JUAL] || "",
          biayaRestorasi: parseSheetNumber(row[SHEET_MOTOR_BELI_COLS.BIAYA_RESTORASI] || "0"),
          detailRestorasi,
        };
      })
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

    return NextResponse.json({ status: "success", data } satisfies ApiResponse<MotorBeliData[]>);
  } catch (error) {
    console.error("[API/beli GET] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal mengambil data";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}

// ============================================================
// POST
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body: SubmitMotorBeliPayload = await request.json();

    if (!body.namaMotor?.trim()) {
      return NextResponse.json(
        { status: "error", message: "Nama motor wajib diisi." } satisfies ApiResponse,
        { status: 400 }
      );
    }
    if (!body.hargaBeli || body.hargaBeli <= 0) {
      return NextResponse.json(
        { status: "error", message: "Harga beli wajib diisi." } satisfies ApiResponse,
        { status: 400 }
      );
    }

    await ensureSheetExists(SHEET_NAMES.MOTOR_BELI);

    const id = generateId("BLI");
    // Gunakan tanggal dari body jika ada, fallback ke sekarang
    let tanggalISO: string;
    if (body.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(body.tanggal)) {
      const now = new Date();
      const wibHour = (now.getUTCHours() + 7) % 24;
      const wibMin = now.getUTCMinutes();
      const wibSec = now.getUTCSeconds();
      const wibDate = new Date(`${body.tanggal}T${String(wibHour).padStart(2,"0")}:${String(wibMin).padStart(2,"0")}:${String(wibSec).padStart(2,"0")}+07:00`);
      tanggalISO = wibDate.toISOString();
    } else if (body.tanggal) {
      tanggalISO = new Date(body.tanggal).toISOString();
    } else {
      tanggalISO = new Date().toISOString();
    }

    // Format tanggal untuk sheet (readable WIB)
    const tanggalSheet = formatDateForSheet(tanggalISO);

    // Upload foto via Apps Script
    const folderUtamaId = process.env.FOLDER_UTAMA_ID;
    let fotoUrls: string[] = [];
    const motorFolderName = `BELI_${body.namaMotor.replace(/[^a-zA-Z0-9 ]/g, "")} - ${id}`;

    if (folderUtamaId && body.fotos?.length > 0) {
      const beliFolderId = await ensureSubfolderExists(folderUtamaId, "BELI");

      for (let idx = 0; idx < body.fotos.length; idx++) {
        const foto = body.fotos[idx];
        if (!isValidBase64Image(foto.base64)) continue;
        // Retry upload sampai 3x
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const url = await uploadImageViaAppsScript(
              foto.base64, foto.name || `foto_${idx + 1}.jpg`, beliFolderId, motorFolderName
            );
            fotoUrls.push(url);
            break;
          } catch (e) {
            if (attempt === 3) {
              console.error(`[API/beli] Foto ${idx + 1} gagal setelah 3x percobaan:`, e);
            } else {
              await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
          }
        }
      }
    }

    // Format angka sebagai Rupiah untuk keterbacaan di sheet
    const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

    await appendToSheet(SHEET_NAMES.MOTOR_BELI, [
      id,
      tanggalSheet,
      body.namaMotor.trim(),
      rp(body.hargaBeli),
      fotoUrls.join(", "),
      motorFolderName,
      "stok",
      "",
      "",  // Biaya Restorasi (kosong saat beli)
      "",  // Detail Restorasi (kosong saat beli)
    ]);

    return NextResponse.json({
      status: "success",
      message: `Motor ${body.namaMotor} berhasil dicatat sebagai pembelian!`,
      data: { id, fotoUrls },
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/beli POST] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal menyimpan data";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}


// ============================================================
// PATCH — Update biaya restorasi pada record beli yang sudah ada
// ============================================================
export async function PATCH(request: NextRequest) {
  try {
    const body: UpdateRestorasiPayload = await request.json();
    const { idBeli, detailRestorasi, biayaRestorasi } = body;

    if (!idBeli) {
      return NextResponse.json(
        { status: "error", message: "ID beli wajib diisi." } satisfies ApiResponse,
        { status: 400 }
      );
    }

    await ensureSheetExists(SHEET_NAMES.MOTOR_BELI);
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID!;
    const rows = await readSheet(SHEET_NAMES.MOTOR_BELI);

    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][SHEET_MOTOR_BELI_COLS.ID] === idBeli) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json(
        { status: "error", message: "Data pembelian tidak ditemukan." } satisfies ApiResponse,
        { status: 404 }
      );
    }

    const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
    const detailJson = JSON.stringify(detailRestorasi || []);

    // Update kolom I (BIAYA_RESTORASI = col 9) dan J (DETAIL_RESTORASI = col 10)
    // Sheet row = rowIndex + 1 (1-indexed), kolom I = col 9
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAMES.MOTOR_BELI}!I${rowIndex + 1}:J${rowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: [[rp(biayaRestorasi), detailJson]] },
    });

    return NextResponse.json({
      status: "success",
      message: "Biaya restorasi berhasil disimpan.",
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/beli PATCH] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal menyimpan restorasi";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}


// ============================================================
// DELETE
// ============================================================
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };

    if (!id) {
      return NextResponse.json(
        { status: "error", message: "ID wajib diisi." } satisfies ApiResponse,
        { status: 400 }
      );
    }

    await ensureSheetExists(SHEET_NAMES.MOTOR_BELI);
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID!;
    
    // Get sheet metadata to find correct sheetId
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === SHEET_NAMES.MOTOR_BELI);
    const sheetId = sheet?.properties?.sheetId ?? 0;
    
    const rows = await readSheet(SHEET_NAMES.MOTOR_BELI);

    // Find row index
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][SHEET_MOTOR_BELI_COLS.ID] === id) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json(
        { status: "error", message: "Data tidak ditemukan." } satisfies ApiResponse,
        { status: 404 }
      );
    }

    // Delete row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        }],
      },
    });

    return NextResponse.json({
      status: "success",
      message: "Data pembelian berhasil dihapus.",
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/beli DELETE] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal menghapus data";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}
