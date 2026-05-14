/**
 * GET  /api/pengeluaran  - Ambil semua data pengeluaran
 * POST /api/pengeluaran  - Catat pengeluaran / tarik saldo baru
 * DELETE /api/pengeluaran - Hapus data pengeluaran
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readSheet, appendToSheet, ensureSheetExists, getSheetsClient,
  uploadImageViaAppsScript, ensureSubfolderExists,
} from "@/lib/google";
import {
  SHEET_NAMES,
  SHEET_PENGELUARAN_COLS,
  type PengeluaranData,
  type SubmitPengeluaranPayload,
  type ApiResponse,
} from "@/types";
import { generateId, formatDateForSheet, parseDateFromSheet, isValidBase64Image } from "@/lib/utils";
import { parseSheetNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

// ============================================================
// GET - Ambil semua pengeluaran
// ============================================================
export async function GET() {
  try {
    await ensureSheetExists(SHEET_NAMES.PENGELUARAN);
    const rows = await readSheet(SHEET_NAMES.PENGELUARAN);

    const data: PengeluaranData[] = rows
      .slice(1)
      .filter((row) => row[SHEET_PENGELUARAN_COLS.ID])
      .map((row) => ({
        id: row[SHEET_PENGELUARAN_COLS.ID] || "",
        tanggal: parseDateFromSheet(row[SHEET_PENGELUARAN_COLS.TANGGAL] || ""),
        keperluan: row[SHEET_PENGELUARAN_COLS.KEPERLUAN] || "",
        nominal: parseSheetNumber(row[SHEET_PENGELUARAN_COLS.NOMINAL]),
        fotos: row[SHEET_PENGELUARAN_COLS.FOTOS]
          ? row[SHEET_PENGELUARAN_COLS.FOTOS].split(",").map((u) => u.trim()).filter(Boolean)
          : [],
        folderId: row[SHEET_PENGELUARAN_COLS.FOLDER_ID] || "",
      }))
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

    return NextResponse.json({ status: "success", data } satisfies ApiResponse<PengeluaranData[]>);
  } catch (error) {
    console.error("[API/pengeluaran GET] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal mengambil data";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}

// ============================================================
// POST - Catat pengeluaran baru
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body: SubmitPengeluaranPayload = await request.json();

    if (!body.keperluan?.trim()) {
      return NextResponse.json(
        { status: "error", message: "Keperluan pengeluaran wajib diisi." } satisfies ApiResponse,
        { status: 400 }
      );
    }
    if (!body.nominal || body.nominal <= 0) {
      return NextResponse.json(
        { status: "error", message: "Nominal pengeluaran harus lebih dari 0." } satisfies ApiResponse,
        { status: 400 }
      );
    }

    await ensureSheetExists(SHEET_NAMES.PENGELUARAN);

    const id = generateId("EXP");
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
    const expFolderName = `EXP_${body.keperluan.trim().replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 30)} - ${id}`;

    if (folderUtamaId && body.fotos && body.fotos.length > 0) {
      const expParentFolderId = await ensureSubfolderExists(folderUtamaId, "PENGELUARAN");

      for (let idx = 0; idx < body.fotos.length; idx++) {
        const foto = body.fotos[idx];
        if (!isValidBase64Image(foto.base64)) continue;
        // Retry upload sampai 3x
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const url = await uploadImageViaAppsScript(
              foto.base64, foto.name || `nota_${idx + 1}.jpg`, expParentFolderId, expFolderName
            );
            fotoUrls.push(url);
            break;
          } catch (e) {
            if (attempt === 3) {
              console.error(`[API/pengeluaran] Foto ${idx + 1} gagal setelah 3x percobaan:`, e);
            } else {
              await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
          }
        }
      }
    }

    // Format angka sebagai Rupiah untuk keterbacaan di sheet
    const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

    await appendToSheet(SHEET_NAMES.PENGELUARAN, [
      id,
      tanggalSheet,
      body.keperluan.trim(),
      rp(body.nominal),
      fotoUrls.join(", "),
      fotoUrls.length > 0 ? expFolderName : "",
    ]);

    return NextResponse.json({
      status: "success",
      message: "Pengeluaran berhasil dicatat!",
      data: { id, fotoUrls, folderId: fotoUrls.length > 0 ? expFolderName : "" },
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/pengeluaran POST] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal menyimpan pengeluaran";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}


// ============================================================
// DELETE - Hapus pengeluaran + pindahkan folder foto ke HAPUS
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

    await ensureSheetExists(SHEET_NAMES.PENGELUARAN);
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID!;
    
    // Get sheet metadata to find correct sheetId
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === SHEET_NAMES.PENGELUARAN);
    const sheetId = sheet?.properties?.sheetId ?? 0;
    
    const rows = await readSheet(SHEET_NAMES.PENGELUARAN);

    // Find row index + ambil folderId untuk pindahkan ke HAPUS
    let rowIndex = -1;
    let folderId = "";
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][SHEET_PENGELUARAN_COLS.ID] === id) {
        rowIndex = i;
        folderId = rows[i][SHEET_PENGELUARAN_COLS.FOLDER_ID] || "";
        break;
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json(
        { status: "error", message: "Data tidak ditemukan." } satisfies ApiResponse,
        { status: 404 }
      );
    }

    // Hapus baris dari sheet
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

    // Pindahkan folder foto ke HAPUS (non-blocking, best effort) — sama seperti motor DELETE
    if (folderId) {
      try {
        const { getDriveClient } = await import("@/lib/google");
        const drive = await getDriveClient();
        const folderUtamaId = process.env.FOLDER_UTAMA_ID;
        if (folderUtamaId) {
          const hapusFolderId = await ensureSubfolderExists(folderUtamaId, "HAPUS");
          if (hapusFolderId) {
            // Cari folder berdasarkan nama di dalam subfolder PENGELUARAN
            const pengeluaranFolderId = await ensureSubfolderExists(folderUtamaId, "PENGELUARAN");
            const folderSearch = await drive.files.list({
              q: `name='${folderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
              fields: "files(id, name, parents)",
            });
            const folder = folderSearch.data.files?.[0];
            if (folder?.id && folder.parents && folder.parents.length > 0) {
              await drive.files.update({
                fileId: folder.id,
                addParents: hapusFolderId,
                removeParents: folder.parents.join(","),
                fields: "id, parents",
              });
            }
            // Suppress unused variable warning
            void pengeluaranFolderId;
          }
        }
      } catch (e) {
        console.error("[API/pengeluaran DELETE] Gagal memindahkan folder foto:", e);
        // Non-fatal — data sheet sudah terhapus
      }
    }

    return NextResponse.json({
      status: "success",
      message: "Data pengeluaran berhasil dihapus.",
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/pengeluaran DELETE] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal menghapus data";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}
