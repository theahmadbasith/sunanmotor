/**
 * Google API Client - Sunan MotoTrack
 * Menggunakan Service Account via environment variable GOOGLE_SERVICE_ACCOUNT_JSON
 */

import { google } from "googleapis";
import { JWT } from "google-auth-library";

import {
  SHEET_NAMES,
  SHEET_MOTOR_COLS,
  SHEET_MOTOR_BELI_COLS,
  SHEET_PENGELUARAN_COLS,
} from "@/types";

// ============================================================
// AUTH CLIENT
// ============================================================

let _authClient: JWT | null = null;

function getAuthClient(): JWT {
  if (_authClient) return _authClient;

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable tidak ditemukan.");
  }

  let credentials: {
    client_email: string;
    private_key: string;
  };

  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.");
  }

  _authClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  return _authClient;
}

// ============================================================
// GOOGLE SHEETS HELPERS
// ============================================================

export async function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: "v4", auth });
}

export async function getDriveClient() {
  const auth = getAuthClient();
  return google.drive({ version: "v3", auth });
}

/**
 * Baca semua baris dari sheet tertentu
 */
export async function readSheet(sheetName: string): Promise<string[][]> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID tidak ditemukan.");

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });

  return (response.data.values as string[][]) || [];
}

/**
 * Tambah baris baru ke sheet
 * Gunakan RAW untuk mencegah Google Sheets menginterpretasi nilai sebagai formula/angka
 */
export async function appendToSheet(sheetName: string, row: (string | number)[]): Promise<void> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID tidak ditemukan.");

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "RAW",
    requestBody: {
      values: [row],
    },
  });
}

/**
 * Pastikan sheet dengan nama tertentu ada, buat jika belum ada
 * Jika baru dibuat, tambahkan header row dengan styling biru bold
 */
export async function ensureSheetExists(sheetName: string): Promise<void> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID tidak ditemukan.");

  const sheets = await getSheetsClient();

  // Cek apakah sheet sudah ada
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = spreadsheet.data.sheets?.map((s) => s.properties?.title) || [];

  if (!existingSheets.includes(sheetName)) {
    // Buat sheet baru
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });

    const newSheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
    const headers = getExpectedHeaders(sheetName);

    if (headers.length > 0) {
      await appendToSheet(sheetName, headers);
      await applyHeaderStyling(sheets, spreadsheetId, newSheetId, headers.length);
    }

    // Seed default PIN untuk sheet Pengaturan
    if (sheetName === "Pengaturan") {
      const nowReadable = new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      await appendToSheet(sheetName, ["pin", "PIN: 000000", nowReadable]);
    }
  }
}

/**
 * Setup sheet secara penuh — buat jika belum ada, perbaiki header jika sudah ada tapi tidak sesuai.
 * Data yang sudah ada TIDAK akan dihapus.
 * Dipanggil dari /api/settings/setup-sheet
 */
export async function setupSheet(sheetName: string): Promise<{ action: string; detail: string }> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID tidak ditemukan.");

  const sheets = await getSheetsClient();
  const expectedHeaders = getExpectedHeaders(sheetName);
  if (expectedHeaders.length === 0) {
    return { action: "skip", detail: `Sheet "${sheetName}" tidak dikenal, dilewati.` };
  }

  // Ambil info semua sheet
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetMeta = spreadsheet.data.sheets?.find((s) => s.properties?.title === sheetName);

  // ── KASUS 1: Sheet belum ada → buat baru ──
  if (!sheetMeta) {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    const newSheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
    await appendToSheet(sheetName, expectedHeaders);
    await applyHeaderStyling(sheets, spreadsheetId, newSheetId, expectedHeaders.length);

    // Seed PIN default untuk Pengaturan
    if (sheetName === "Pengaturan") {
      const nowReadable = new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      await appendToSheet(sheetName, ["pin", "PIN: 000000", nowReadable]);
    }

    return { action: "created", detail: `Sheet "${sheetName}" dibuat baru dengan header.` };
  }

  // ── KASUS 2: Sheet sudah ada → cek header ──
  const sheetId = sheetMeta.properties?.sheetId ?? 0;
  const rows = await readSheet(sheetName);
  const currentHeader = rows[0] ?? [];

  // Cek apakah header sudah sesuai (bandingkan kolom yang ada)
  const headersMatch = expectedHeaders.every(
    (h, i) => (currentHeader[i] ?? "").trim().toLowerCase() === h.toLowerCase()
  );

  if (headersMatch) {
    // Header sudah benar, hanya pastikan styling diterapkan
    await applyHeaderStyling(sheets, spreadsheetId, sheetId, expectedHeaders.length);
    return { action: "ok", detail: `Sheet "${sheetName}" sudah benar, styling diperbarui.` };
  }

  // ── KASUS 3: Header tidak sesuai → perbaiki tanpa merusak data ──
  // Strategi: jika baris pertama bukan header yang benar, insert baris baru di atas
  // Jika baris pertama kosong atau seperti header lama, replace saja
  const firstRowIsData = currentHeader.length > 0 && !looksLikeHeader(currentHeader);

  if (firstRowIsData) {
    // Ada data di baris 1 (tidak ada header sama sekali) → insert baris header di atas
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          insertDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: 0,
              endIndex: 1,
            },
            inheritFromBefore: false,
          },
        }],
      },
    });
    // Tulis header di baris 1 yang baru diinsert
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${columnLetter(expectedHeaders.length)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [expectedHeaders] },
    });
  } else {
    // Baris pertama adalah header lama atau kosong → update langsung
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${columnLetter(expectedHeaders.length)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [expectedHeaders] },
    });
  }

  // Terapkan styling header
  await applyHeaderStyling(sheets, spreadsheetId, sheetId, expectedHeaders.length);

  return {
    action: "fixed",
    detail: `Header sheet "${sheetName}" diperbaiki. Data lama ${firstRowIsData ? "digeser ke bawah" : "tidak berubah"}.`,
  };
}

// ── HELPERS ──

/** Kembalikan expected headers untuk setiap sheet */
function getExpectedHeaders(sheetName: string): string[] {
  if (sheetName === "Penjualan") {
    return ["ID", "Tanggal Jual", "Nama Motor", "Harga Beli", "Biaya Restorasi",
            "Total Modal", "Harga Jual", "Untung Bersih", "Foto URLs", "Folder ID", "ID Beli", "Detail Restorasi"];
  }
  if (sheetName === "Pengeluaran") {
    return ["ID", "Tanggal", "Keperluan", "Nominal", "Foto URLs", "Folder ID"];
  }
  if (sheetName === "Pengaturan") {
    return ["Key", "Value", "UpdatedAt"];
  }
  if (sheetName === "Pembelian") {
    return ["ID", "Tanggal Beli", "Nama Motor", "Harga Beli", "Foto URLs", "Folder ID", "Status", "ID Jual", "Biaya Restorasi", "Detail Restorasi"];
  }
  return [];
}

/** Cek apakah baris pertama terlihat seperti header (bukan data) */
function looksLikeHeader(row: string[]): boolean {
  if (!row || row.length === 0) return false;
  const first = (row[0] ?? "").trim().toLowerCase();
  // Header biasanya berisi kata-kata deskriptif, bukan ID seperti "MTR-xxx" atau "BLI-xxx"
  const dataIdPattern = /^(mtr|bli|exp|trx)-/i;
  if (dataIdPattern.test(first)) return false;
  // Jika kolom pertama adalah "id", "key", atau nama kolom yang dikenal → header
  return ["id", "key", "no"].includes(first) || first.length < 20;
}

/** Konversi angka kolom ke huruf (1→A, 2→B, ..., 26→Z, 27→AA) */
function columnLetter(n: number): string {
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/** Terapkan styling header: background biru, teks putih bold, freeze baris 1, auto-resize */
async function applyHeaderStyling(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  sheetId: number,
  colCount: number
): Promise<void> {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: colCount,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.39, blue: 0.78 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  fontSize: 10,
                },
                horizontalAlignment: "CENTER",
                verticalAlignment: "MIDDLE",
                wrapStrategy: "CLIP",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: colCount,
            },
          },
        },
      ],
    },
  });
}

/**
 * Baca satu nilai dari sheet Pengaturan berdasarkan key
 * Nilai PIN disimpan sebagai "PIN: 000000" di sheet agar terbaca sebagai teks,
 * tapi dikembalikan sebagai "000000" ke aplikasi.
 * Nilai WA disimpan sebagai "WA: 085xxx" di sheet,
 * tapi dikembalikan sebagai "085xxx" ke aplikasi.
 */
export async function getSettingValue(key: string): Promise<string | null> {
  const rows = await readSheet("Pengaturan");
  for (const row of rows.slice(1)) {
    if (row[0] === key) {
      const raw = row[1] ?? null;
      return raw !== null ? stripPrefixes(raw) : null;
    }
  }
  return null;
}

/**
 * Tulis / update nilai di sheet Pengaturan
 * Nilai PIN disimpan dengan prefix "PIN: " agar Google Sheets tidak mengubahnya
 * Nilai WA disimpan dengan prefix "WA: " agar terbaca sebagai teks
 */
export async function setSettingValue(key: string, value: string): Promise<void> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID tidak ditemukan.");

  const sheets = await getSheetsClient();
  const rows = await readSheet("Pengaturan");
  const now = new Date();
  // Format updatedAt sebagai readable WIB untuk sheet
  const nowForSheet = now.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  let storedValue: string;
  if (key === "pin") {
    storedValue = `PIN: ${value}`;
  } else if (key === "nomorWa") {
    storedValue = value ? `WA: ${value}` : "";
  } else if (key === "lockPassword") {
    storedValue = value ? `PASS: ${value}` : "";
  } else if (key === "updatedAt") {
    // Simpan updatedAt sebagai readable WIB — value bisa berupa ISO string atau sudah readable
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      d = new Date(value);
    } else {
      d = new Date(); // fallback ke sekarang jika format tidak dikenal
    }
    storedValue = isNaN(d.getTime())
      ? nowForSheet
      : d.toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        });
  } else {
    storedValue = value;
  }

  // Cari baris yang sudah ada
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      // Update baris yang ada (i+1 karena sheet 1-indexed)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Pengaturan!A${i + 1}:C${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [[key, storedValue, nowForSheet]] },
      });
      return;
    }
  }

  // Belum ada, append baru
  await appendToSheet("Pengaturan", [key, storedValue, nowForSheet]);
}

/**
 * Baca semua pengaturan sekaligus sebagai object
 * Nilai PIN dan WA di-strip prefix-nya sebelum dikembalikan
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await readSheet("Pengaturan");
  const result: Record<string, string> = {};
  for (const row of rows.slice(1)) {
    if (row[0]) result[row[0]] = stripPrefixes(row[1] ?? "");
  }
  return result;
}

/**
 * Strip semua prefix yang dikenal (PIN, WA, PASS)
 */
function stripPrefixes(value: string): string {
  if (value.startsWith("PIN: ")) return value.slice(5);
  if (value.startsWith("WA: ")) return value.slice(4);
  if (value.startsWith("PASS: ")) return value.slice(6);
  return value;
}

// ============================================================
// GOOGLE DRIVE HELPERS (via Apps Script)
// Upload foto didelegasikan ke Apps Script karena Service Account
// tidak memiliki storage quota Drive pribadi.
// ============================================================

/**
 * Upload file gambar via Google Apps Script Web App
 * base64Data: string "data:image/jpeg;base64,..."
 * Mengembalikan URL file yang bisa diakses publik
 */
export async function uploadImageViaAppsScript(
  base64Data: string,
  fileName: string,
  folderId: string,
  folderName: string
): Promise<string> {
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  if (!appsScriptUrl) {
    throw new Error("APPS_SCRIPT_URL environment variable tidak ditemukan.");
  }

  // Parse base64
  const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("Format base64 tidak valid.");
  }

  const mimeType = matches[1];
  const content = matches[2]; // base64 tanpa prefix

  const payload = {
    folderId,
    folderName,
    fileData: {
      name: fileName,
      mimeType,
      content,
    },
  };

  const response = await fetch(appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000), // 30s timeout
  });

  if (!response.ok) {
    throw new Error(`Apps Script error: HTTP ${response.status}`);
  }

  let result: { status: string; id?: string; error?: string };
  try {
    result = await response.json();
  } catch {
    throw new Error("Apps Script response bukan JSON valid");
  }

  if (result.status !== "success" || !result.id) {
    throw new Error(`Apps Script error: ${result.error || "Unknown error"}`);
  }

  // Return URL thumbnail yang bisa langsung dipakai di <img>
  return `https://drive.google.com/thumbnail?id=${result.id}&sz=w400`;
}

/**
 * Cari subfolder dengan nama tertentu di dalam parentFolderId.
 * Jika tidak ada, buat folder tersebut.
 */
export async function ensureSubfolderExists(parentFolderId: string, subfolderName: string): Promise<string> {
  const drive = await getDriveClient();
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${subfolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });

  if (res.data.files && res.data.files.length > 0 && res.data.files[0].id) {
    return res.data.files[0].id;
  }

  // Buat folder baru
  const createRes = await drive.files.create({
    requestBody: {
      name: subfolderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });

  if (!createRes.data.id) throw new Error(`Gagal membuat folder ${subfolderName}`);
  return createRes.data.id;
}

/**
 * Pindahkan folder motor/pengeluaran (yatim piatu) yang tidak ada di Sheet ke folder HAPUS
 * Menangani subfolder di JUAL, BELI, dan PENGELUARAN
 */
export async function cleanOrphanedFolders(): Promise<{ moved: number; error?: string }> {
  try {
    const folderUtamaId = process.env.FOLDER_UTAMA_ID;
    if (!folderUtamaId) throw new Error("FOLDER_UTAMA_ID belum diset");

    const drive = await getDriveClient();
    
    // Pastikan folder HAPUS ada
    const hapusFolderId = await ensureSubfolderExists(folderUtamaId, "HAPUS");

    // Baca ID yang valid dari semua Sheet
    await ensureSheetExists(SHEET_NAMES.MOTOR);
    await ensureSheetExists(SHEET_NAMES.MOTOR_BELI);
    await ensureSheetExists(SHEET_NAMES.PENGELUARAN);
    const [jualRows, beliRows, expRows] = await Promise.all([
      readSheet(SHEET_NAMES.MOTOR),
      readSheet(SHEET_NAMES.MOTOR_BELI),
      readSheet(SHEET_NAMES.PENGELUARAN),
    ]);

    const validFolderNames = new Set<string>();
    
    for (const row of jualRows.slice(1)) {
      if (row[SHEET_MOTOR_COLS.FOLDER_ID]) validFolderNames.add(row[SHEET_MOTOR_COLS.FOLDER_ID]);
    }
    for (const row of beliRows.slice(1)) {
      if (row[SHEET_MOTOR_BELI_COLS.FOLDER_ID]) validFolderNames.add(row[SHEET_MOTOR_BELI_COLS.FOLDER_ID]);
    }
    for (const row of expRows.slice(1)) {
      if (row[SHEET_PENGELUARAN_COLS.FOLDER_ID]) validFolderNames.add(row[SHEET_PENGELUARAN_COLS.FOLDER_ID]);
    }

    let movedCount = 0;

    // ── 1. Cek subfolder langsung di folderUtama (BELI_, JUAL_, MTR_) ──
    const rootRes = await drive.files.list({
      q: `'${folderUtamaId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
    });

    for (const folder of (rootRes.data.files || [])) {
      if (!folder.name || !folder.id) continue;
      // Jangan sentuh folder sistem
      if (["BELI", "JUAL", "PENGELUARAN", "HAPUS"].includes(folder.name)) continue;

      if (
        folder.name.startsWith("BELI_") ||
        folder.name.startsWith("JUAL_") ||
        folder.name.startsWith("MTR_")
      ) {
        if (!validFolderNames.has(folder.name)) {
          await drive.files.update({
            fileId: folder.id,
            addParents: hapusFolderId,
            removeParents: folderUtamaId,
            fields: "id, parents",
          });
          movedCount++;
        }
      }
    }

    // ── 2. Cek subfolder di dalam PENGELUARAN (EXP_) ──
    try {
      const expParentRes = await drive.files.list({
        q: `'${folderUtamaId}' in parents and name = 'PENGELUARAN' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id)",
      });
      const expParentId = expParentRes.data.files?.[0]?.id;

      if (expParentId) {
        const expSubRes = await drive.files.list({
          q: `'${expParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id, name)",
        });

        for (const folder of (expSubRes.data.files || [])) {
          if (!folder.name || !folder.id) continue;
          if (folder.name.startsWith("EXP_") && !validFolderNames.has(folder.name)) {
            await drive.files.update({
              fileId: folder.id,
              addParents: hapusFolderId,
              removeParents: expParentId,
              fields: "id, parents",
            });
            movedCount++;
          }
        }
      }
    } catch (e) {
      console.error("cleanOrphanedFolders: gagal cek subfolder PENGELUARAN:", e);
      // Non-fatal
    }

    // ── 3. Cek subfolder di dalam BELI (BELI_) ──
    try {
      const beliParentRes = await drive.files.list({
        q: `'${folderUtamaId}' in parents and name = 'BELI' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id)",
      });
      const beliParentId = beliParentRes.data.files?.[0]?.id;

      if (beliParentId) {
        const beliSubRes = await drive.files.list({
          q: `'${beliParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id, name)",
        });

        for (const folder of (beliSubRes.data.files || [])) {
          if (!folder.name || !folder.id) continue;
          if (folder.name.startsWith("BELI_") && !validFolderNames.has(folder.name)) {
            await drive.files.update({
              fileId: folder.id,
              addParents: hapusFolderId,
              removeParents: beliParentId,
              fields: "id, parents",
            });
            movedCount++;
          }
        }
      }
    } catch (e) {
      console.error("cleanOrphanedFolders: gagal cek subfolder BELI:", e);
    }

    // ── 4. Cek subfolder di dalam JUAL (MTR_) ──
    try {
      const jualParentRes = await drive.files.list({
        q: `'${folderUtamaId}' in parents and name = 'JUAL' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id)",
      });
      const jualParentId = jualParentRes.data.files?.[0]?.id;

      if (jualParentId) {
        const jualSubRes = await drive.files.list({
          q: `'${jualParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id, name)",
        });

        for (const folder of (jualSubRes.data.files || [])) {
          if (!folder.name || !folder.id) continue;
          if (!validFolderNames.has(folder.name)) {
            await drive.files.update({
              fileId: folder.id,
              addParents: hapusFolderId,
              removeParents: jualParentId,
              fields: "id, parents",
            });
            movedCount++;
          }
        }
      }
    } catch (e) {
      console.error("cleanOrphanedFolders: gagal cek subfolder JUAL:", e);
    }

    return { moved: movedCount };
  } catch (error) {
    console.error("cleanOrphanedFolders error:", error);
    return { moved: 0, error: error instanceof Error ? error.message : "Terjadi kesalahan" };
  }
}

