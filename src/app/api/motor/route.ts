/**
 * GET  /api/motor  - Ambil semua riwayat penjualan motor
 * POST /api/motor  - Simpan data penjualan motor baru + upload foto via Apps Script
 * DELETE /api/motor - Hapus data penjualan motor
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readSheet, appendToSheet, ensureSheetExists, uploadImageViaAppsScript, getSheetsClient, getDriveClient, ensureSubfolderExists,
} from "@/lib/google";
import {
  SHEET_NAMES, SHEET_MOTOR_COLS, SHEET_MOTOR_BELI_COLS,
  type MotorData, type SubmitMotorPayload, type ApiResponse, type DetailRestorasi,
} from "@/types";
import { generateId, isValidBase64Image, formatDateForSheet, parseDateFromSheet } from "@/lib/utils";
import { parseSheetNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

// ============================================================
// GET
// ============================================================
export async function GET() {
  try {
    await ensureSheetExists(SHEET_NAMES.MOTOR);
    const rows = await readSheet(SHEET_NAMES.MOTOR);

    const data: MotorData[] = rows
      .slice(1)
      .filter((row) => row[SHEET_MOTOR_COLS.ID])
      .map((row) => {
        // Parse detail restorasi dari JSON string di sheet
        let detailRestorasi: DetailRestorasi[] = [];
        const rawDetail = row[SHEET_MOTOR_COLS.DETAIL_RESTORASI] || "";
        if (rawDetail) {
          try { detailRestorasi = JSON.parse(rawDetail); } catch { detailRestorasi = []; }
        }
        return {
          id: row[SHEET_MOTOR_COLS.ID] || "",
          tanggal: parseDateFromSheet(row[SHEET_MOTOR_COLS.TANGGAL] || ""),
          namaMotor: row[SHEET_MOTOR_COLS.NAMA_MOTOR] || "",
          hargaBeli: parseSheetNumber(row[SHEET_MOTOR_COLS.HARGA_BELI]),
          biayaReparasi: parseSheetNumber(row[SHEET_MOTOR_COLS.BIAYA_REPARASI]),
          detailRestorasi,
          totalModal: parseSheetNumber(row[SHEET_MOTOR_COLS.TOTAL_MODAL]),
          hargaJual: parseSheetNumber(row[SHEET_MOTOR_COLS.HARGA_JUAL]),
          untungBersih: parseSheetNumber(row[SHEET_MOTOR_COLS.UNTUNG_BERSIH]),
          fotos: row[SHEET_MOTOR_COLS.FOTOS]
            ? row[SHEET_MOTOR_COLS.FOTOS].split(",").map((u) => u.trim()).filter(Boolean)
            : [],
          folderId: row[SHEET_MOTOR_COLS.FOLDER_ID] || "",
          idBeli: row[SHEET_MOTOR_COLS.ID_BELI] || "",
        };
      })
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

    return NextResponse.json({ status: "success", data } satisfies ApiResponse<MotorData[]>);
  } catch (error) {
    console.error("[API/motor GET] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal mengambil data";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}

// ============================================================
// POST
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body: SubmitMotorPayload = await request.json();

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
    if (!body.hargaJual || body.hargaJual <= 0) {
      return NextResponse.json(
        { status: "error", message: "Harga jual wajib diisi." } satisfies ApiResponse,
        { status: 400 }
      );
    }

    await ensureSheetExists(SHEET_NAMES.MOTOR);

    const id = generateId("MTR");
    // Gunakan tanggal dari body jika ada, fallback ke sekarang
    // Jika user pilih tanggal (YYYY-MM-DD), pakai tanggal itu tapi jam = jam submit sekarang (WIB)
    let tanggalISO: string;
    if (body.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(body.tanggal)) {
      const now = new Date();
      const [y, m, d] = body.tanggal.split("-").map(Number);
      // Jam sekarang dalam WIB
      const wibHour = (now.getUTCHours() + 7) % 24;
      const wibMin = now.getUTCMinutes();
      const wibSec = now.getUTCSeconds();
      // Buat Date object di WIB lalu konversi ke UTC
      // Gunakan cara yang benar: buat tanggal lokal WIB, lalu offset ke UTC
      const wibDate = new Date(`${body.tanggal}T${String(wibHour).padStart(2,"0")}:${String(wibMin).padStart(2,"0")}:${String(wibSec).padStart(2,"0")}+07:00`);
      tanggalISO = wibDate.toISOString();
    } else if (body.tanggal) {
      tanggalISO = new Date(body.tanggal).toISOString();
    } else {
      tanggalISO = new Date().toISOString();
    }

    // Format tanggal untuk sheet (readable WIB)
    const tanggalSheet = formatDateForSheet(tanggalISO);
    
    const biayaReparasi = body.biayaReparasi || 0;
    const totalModal = body.hargaBeli + biayaReparasi;
    const untungBersih = body.hargaJual - totalModal;

    // Siapkan detail restorasi — bisa dari body langsung, atau nanti diambil dari sheet beli
    let detailRestorasi = body.detailRestorasi || [];

    // Upload foto via Apps Script
    const folderUtamaId = process.env.FOLDER_UTAMA_ID;
    let fotoUrls: string[] = [];
    const motorFolderName = `${body.namaMotor.replace(/[^a-zA-Z0-9 ]/g, "")} - ${id}`;

    if (folderUtamaId && body.fotos?.length > 0) {
      const jualFolderId = await ensureSubfolderExists(folderUtamaId, "JUAL");

      const validFotos = body.fotos.filter((f) => isValidBase64Image(f.base64));
      for (let idx = 0; idx < validFotos.length; idx++) {
        const foto = validFotos[idx];
        // Retry upload sampai 3x
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const url = await uploadImageViaAppsScript(
              foto.base64, foto.name || `foto_${idx + 1}.jpg`, jualFolderId, motorFolderName
            );
            fotoUrls.push(url);
            break; // sukses, lanjut foto berikutnya
          } catch (e) {
            if (attempt === 3) {
              console.error(`[API/motor] Foto ${idx + 1} gagal setelah 3x percobaan:`, e);
            } else {
              await new Promise((r) => setTimeout(r, 1000 * attempt)); // backoff
            }
          }
        }
      }
    }

    // Format angka sebagai Rupiah untuk keterbacaan di sheet
    const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

    // Tentukan idBeli sebelum proses sheet Pembelian:
    // - Jika ada idBeli dari body → pakai itu (lanjut jual dari riwayat)
    // - Jika tidak ada → generate ID baru (jual langsung, record beli dibuat otomatis)
    const resolvedIdBeli = body.idBeli || generateId("BLI");

    // Jika ada idBeli dari body → update status baris yang ada di sheet Pembelian + baca detailRestorasi
    // Jika tidak ada idBeli → buat record beli baru di sheet Pembelian dengan status "terjual"

    try {
      await ensureSheetExists(SHEET_NAMES.MOTOR_BELI);

      if (body.idBeli) {
        // ── Kasus: Lanjut Jual dari riwayat beli ──
        // Update baris yang sudah ada → status "terjual" + isi ID_JUAL
        // Juga baca detailRestorasi dari sheet beli jika belum ada di body
        const beliRows = await readSheet(SHEET_NAMES.MOTOR_BELI);
        const sheets = await getSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID!;

        for (let i = 1; i < beliRows.length; i++) {
          if (beliRows[i][SHEET_MOTOR_BELI_COLS.ID] === body.idBeli) {
            // Baca detailRestorasi dari sheet beli jika body tidak membawa
            if (detailRestorasi.length === 0) {
              const rawDetail = beliRows[i][SHEET_MOTOR_BELI_COLS.DETAIL_RESTORASI] || "";
              if (rawDetail) {
                try { detailRestorasi = JSON.parse(rawDetail); } catch { detailRestorasi = []; }
              }
              // Juga baca biayaRestorasi dari sheet beli jika biayaReparasi dari body = 0
              if (biayaReparasi === 0) {
                const rawBiaya = beliRows[i][SHEET_MOTOR_BELI_COLS.BIAYA_RESTORASI] || "";
                if (rawBiaya) {
                  const parsed = parseSheetNumber(rawBiaya);
                  if (parsed > 0) {
                    // Update biayaReparasi dan recalculate
                    (body as SubmitMotorPayload).biayaReparasi = parsed;
                  }
                }
              }
            }
            // Update status + ID_JUAL + biaya restorasi + detail restorasi di sheet beli
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${SHEET_NAMES.MOTOR_BELI}!G${i + 1}:J${i + 1}`,
              valueInputOption: "RAW",
              requestBody: { values: [["terjual", id, rp(biayaReparasi), JSON.stringify(detailRestorasi)]] },
            });
            break;
          }
        }
      } else {
        // ── Kasus: Jual langsung dari menu Jual (motor baru, belum pernah dicatat beli) ──
        // Buat record beli baru dengan status "terjual" sekaligus
        await appendToSheet(SHEET_NAMES.MOTOR_BELI, [
          resolvedIdBeli,
          tanggalSheet,
          body.namaMotor.trim(),
          rp(body.hargaBeli),
          fotoUrls.join(", "),   // pakai foto yang sama
          motorFolderName,
          "terjual",             // langsung terjual
          id,                    // ID_JUAL = ID penjualan yang baru dibuat
          rp(biayaReparasi),     // Biaya Restorasi
          JSON.stringify(detailRestorasi), // Detail Restorasi
        ]);
      }
    } catch (e) {
      console.error("[API/motor] Gagal proses sheet Pembelian:", e);
      // Non-fatal, lanjut
    }

    // Append ke sheet Penjualan dengan detailRestorasi yang sudah lengkap
    await appendToSheet(SHEET_NAMES.MOTOR, [
      id,
      tanggalSheet,
      body.namaMotor.trim(),
      rp(body.hargaBeli),
      rp(biayaReparasi),
      rp(totalModal),
      rp(body.hargaJual),
      rp(untungBersih),
      fotoUrls.join(", "),
      motorFolderName,
      resolvedIdBeli,
      JSON.stringify(detailRestorasi),
    ]);

    return NextResponse.json({
      status: "success",
      message: `Data penjualan ${body.namaMotor} berhasil disimpan!`,
      data: { id, untungBersih, fotoUrls, idBeli: resolvedIdBeli },
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/motor POST] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal menyimpan data";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}


// ============================================================
// DELETE — Hapus dari sheet Penjualan + sekalian sheet Pembelian jika ada idBeli
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

    await ensureSheetExists(SHEET_NAMES.MOTOR);
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID!;
    
    // Get sheet metadata to find correct sheetId
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const motorSheet = spreadsheet.data.sheets?.find(s => s.properties?.title === SHEET_NAMES.MOTOR);
    const motorSheetId = motorSheet?.properties?.sheetId ?? 0;
    
    const rows = await readSheet(SHEET_NAMES.MOTOR);

    // Find row index + ambil idBeli untuk hapus di sheet Pembelian juga
    let rowIndex = -1;
    let folderId = "";
    let idBeli = "";
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][SHEET_MOTOR_COLS.ID] === id) {
        rowIndex = i;
        folderId = rows[i][SHEET_MOTOR_COLS.FOLDER_ID] || "";
        idBeli = rows[i][SHEET_MOTOR_COLS.ID_BELI] || "";
        break;
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json(
        { status: "error", message: "Data tidak ditemukan." } satisfies ApiResponse,
        { status: 404 }
      );
    }

    // Hapus baris dari sheet Penjualan
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: motorSheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        }],
      },
    });

    // Hapus baris terkait dari sheet Pembelian (jika ada idBeli)
    if (idBeli) {
      try {
        await ensureSheetExists(SHEET_NAMES.MOTOR_BELI);
        const beliRows = await readSheet(SHEET_NAMES.MOTOR_BELI);

        // Re-fetch spreadsheet metadata agar sheet Pembelian pasti ada
        const spreadsheetFresh = await sheets.spreadsheets.get({ spreadsheetId });
        const beliSheet = spreadsheetFresh.data.sheets?.find(s => s.properties?.title === SHEET_NAMES.MOTOR_BELI);
        const beliSheetId = beliSheet?.properties?.sheetId ?? 0;

        let beliRowIndex = -1;
        for (let i = 1; i < beliRows.length; i++) {
          if (beliRows[i][SHEET_MOTOR_BELI_COLS.ID] === idBeli) {
            beliRowIndex = i;
            break;
          }
        }

        if (beliRowIndex !== -1) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{
                deleteDimension: {
                  range: {
                    sheetId: beliSheetId,
                    dimension: "ROWS",
                    startIndex: beliRowIndex,
                    endIndex: beliRowIndex + 1,
                  },
                },
              }],
            },
          });
        }
      } catch (e) {
        console.error("[API/motor DELETE] Gagal hapus baris di sheet Pembelian:", e);
        // Non-fatal, data penjualan sudah terhapus
      }
    }

    // Move photos to HAPUS folder (non-blocking, best effort)
    if (folderId) {
      try {
        const drive = await getDriveClient();
        const hapusFolderId = await ensureSubfolderExists(process.env.FOLDER_UTAMA_ID!, "HAPUS");
        
        if (hapusFolderId) {
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
        }
      } catch (e) {
        console.error("[API/motor DELETE] Gagal memindahkan foto:", e);
      }
    }

    return NextResponse.json({
      status: "success",
      message: "Data penjualan dan pembelian terkait berhasil dihapus.",
    } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/motor DELETE] Error:", error);
    const message = error instanceof Error ? error.message : "Gagal menghapus data";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}
