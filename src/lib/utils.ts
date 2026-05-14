/**
 * Utility functions - Sunan Motor
 */

const APP_NAME = "Sunan Motor";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatRupiah(value: string): string {
  const numberString = value.replace(/[^,\d]/g, "");
  const split = numberString.split(",");
  const sisa = split[0].length % 3;
  let rupiah = split[0].substr(0, sisa);
  const ribuan = split[0].substr(sisa).match(/\d{3}/gi);
  if (ribuan) {
    const separator = sisa ? "." : "";
    rupiah += separator + ribuan.join(".");
  }
  rupiah = split[1] !== undefined ? rupiah + "," + split[1] : rupiah;
  return rupiah;
}

export function cleanRupiah(rupiahStr: string): number {
  if (!rupiahStr) return 0;
  return parseFloat(rupiahStr.replace(/\./g, "").replace(/,/g, "")) || 0;
}

/**
 * Format tanggal ke zona waktu WIB (UTC+7) Jakarta
 */
export function formatDate(isoString: string): string {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateShort(isoString: string): string {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Dapatkan waktu sekarang dalam UTC+7 (WIB) sebagai ISO string
 */
export function nowWIB(): string {
  return new Date().toISOString();
}

/**
 * Parse angka dari sheet — support format "Rp 10.000.000" maupun angka biasa
 * Juga handle nilai negatif: "Rp -500.000" atau "-500000"
 */
export function parseSheetNumber(raw: string | number): number {
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  if (!raw || String(raw).trim() === "") return 0;
  const str = String(raw).trim();
  // Deteksi tanda negatif sebelum atau sesudah "Rp"
  const isNegative = str.startsWith("-") || str.includes("-");
  const cleaned = str
    .replace(/Rp\s*/gi, "")   // hapus prefix "Rp "
    .replace(/-/g, "")         // hapus tanda minus (sudah dicatat di isNegative)
    .replace(/\./g, "")        // hapus titik ribuan Indonesia
    .replace(/,/g, ".")        // ganti koma desimal ke titik
    .trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
}

/**
 * Format tanggal untuk disimpan di Google Sheets (WIB, readable)
 * Output: "08 Mei 2026, 15:30 WIB"
 * CATATAN: Fungsi ini hanya untuk display. Data tanggal di sheet disimpan sebagai ISO string.
 */
export function formatDateForSheet(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Parse tanggal dari sheet — support ISO string maupun format readable Indonesia
 * Mengembalikan ISO string yang valid, atau string kosong jika tidak bisa diparse
 */
export function parseDateFromSheet(raw: string): string {
  if (!raw || raw.trim() === "") return "";

  const s = raw.trim();

  // 1. Sudah ISO format (YYYY-MM-DD atau YYYY-MM-DDTHH:mm...)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  // 2. Format readable Indonesia dari toLocaleString("id-ID"):
  //    "08 Mei 2026, 15.30 WIB"
  //    "08 Mei 2026 pukul 15.30 WIB"
  //    "8 Mei 2026, 15:30"
  //    "08/05/2026" (fallback format)
  const BULAN: Record<string, number> = {
    // 3-char abbreviations (id-ID locale)
    jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5,
    jul: 6, agu: 7, sep: 8, okt: 9, nov: 10, des: 11,
    // Full names
    januari: 0, februari: 1, maret: 2, april: 3, juni: 5,
    juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
    // English fallback (in case Node.js locale differs)
    january: 0, march: 2, may: 4, june: 5, july: 6,
    august: 7, october: 9, december: 11,
  };

  // Regex: "DD MonthName YYYY" optionally followed by time
  const m = s.match(
    /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(?:[,\s]+(?:pukul\s+)?(\d{1,2})[.:h](\d{2}))?/i
  );
  if (m) {
    const day = parseInt(m[1]);
    const monKey = m[2].toLowerCase();
    const mon = BULAN[monKey] ?? BULAN[monKey.slice(0, 3)];
    const year = parseInt(m[3]);
    const hour = m[4] ? parseInt(m[4]) : 0;
    const min = m[5] ? parseInt(m[5]) : 0;

    if (mon !== undefined && !isNaN(day) && !isNaN(year) && day >= 1 && day <= 31) {
      // Konversi WIB (UTC+7) ke UTC menggunakan ISO string dengan offset eksplisit
      const hh = String(hour).padStart(2, "0");
      const mm = String(min).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      const mo = String(mon + 1).padStart(2, "0");
      const wibStr = `${year}-${mo}-${dd}T${hh}:${mm}:00+07:00`;
      const d = new Date(wibStr);
      return isNaN(d.getTime()) ? "" : d.toISOString();
    }
  }

  // 3. Format DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1]);
    const mon = parseInt(dmyMatch[2]) - 1;
    const year = parseInt(dmyMatch[3]);
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) {
      const d = new Date(Date.UTC(year, mon, day, 0, 0, 0));
      return isNaN(d.getTime()) ? "" : d.toISOString();
    }
  }

  // 4. Fallback: native Date parse
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? "" : fallback.toISOString();
}

/**
 * Format tanggal untuk print/laporan (WIB)
 */
export function formatDatePrint(isoString: string): string {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Format tanggal singkat untuk tabel (WIB)
 */
export function formatDateTable(isoString: string): string {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function generateId(prefix = "TRX"): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function isValidBase64Image(str: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp|heic|heif|gif|bmp|tiff);base64,/.test(str);
}

// ============================================================
// KOMPRESI FOTO & WATERMARK — SINGLE PASS (ANTI-OOM)
// ============================================================

export async function processAndCompressImage(
  fileOrBase64: File | string,
  maxWidth = 1280,
  targetKB = 500,
  withWatermark = true
): Promise<string> {
  if (typeof window === "undefined") return typeof fileOrBase64 === "string" ? fileOrBase64 : "";

  return new Promise((resolve) => {
    const isFile = fileOrBase64 instanceof File;
    
    // Check file size for fallback limit
    const originalSize = isFile ? fileOrBase64.size : 0;
    
    // STRATEGI BARU: Untuk semua File, gunakan FileReader dulu (lebih reliable)
    if (isFile) {
      const reader = new FileReader();
      
      const timeout = setTimeout(() => {
        console.error("FileReader timeout untuk file:", fileOrBase64.name);
        // Fallback jika file tidak terlalu besar
        if (originalSize < 5 * 1024 * 1024) {
           console.log("Fallback to original due to FileReader timeout");
           const r2 = new FileReader();
           r2.onload = (e) => resolve(e.target?.result as string || "");
           r2.readAsDataURL(fileOrBase64);
        } else {
           resolve("");
        }
      }, 25000); // 25 detik
      
      reader.onload = (e) => {
        clearTimeout(timeout);
        const base64 = e.target?.result as string;
        if (!base64 || !base64.startsWith('data:image/')) {
          console.error("Invalid base64 dari FileReader");
          resolve("");
          return;
        }
        
        processImageFromBase64(base64, maxWidth, targetKB, withWatermark, (result) => {
          if (!result && originalSize < 5 * 1024 * 1024) {
            console.log("Processing failed, using original base64 (fallback)");
            resolve(base64);
          } else {
            resolve(result);
          }
        });
      };
      
      reader.onerror = (err) => {
        clearTimeout(timeout);
        console.error("FileReader error:", err);
        resolve("");
      };
      
      try {
        reader.readAsDataURL(fileOrBase64);
      } catch (err) {
        clearTimeout(timeout);
        console.error("FileReader exception:", err);
        resolve("");
      }
      return;
    }
    
    // Untuk base64 string yang sudah ada
    if (typeof fileOrBase64 === "string") {
      processImageFromBase64(fileOrBase64, maxWidth, targetKB, withWatermark, resolve);
    }
  });
}

// Helper function untuk process image dari base64
function processImageFromBase64(
  base64: string,
  maxWidth: number,
  targetKB: number,
  withWatermark: boolean,
  resolve: (val: string) => void
) {
  if (!base64 || !base64.startsWith('data:image/')) {
    console.error("Invalid base64 format");
    resolve("");
    return;
  }
  
  const img = new Image();
  
  // Timeout
  const timeout = setTimeout(() => {
    console.error("Image processing timeout");
    tryForceResize(base64, maxWidth, targetKB, withWatermark, resolve);
  }, 20000);
  
  img.onload = () => {
    clearTimeout(timeout);
    try {
      let { naturalWidth: width, naturalHeight: height } = img;
      if (!width || !height || width < 1 || height < 1) {
        console.error("Invalid image dimensions:", width, height);
        // Terakhir coba force resize atau return original (handled by caller)
        resolve("");
        return;
      }

      // Resize jika perlu
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        console.error("Cannot get canvas context");
        resolve("");
        return;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      if (withWatermark) {
        drawWatermarkSync(ctx, width, height);
      }

      const targetBytes = targetKB * 1024;
      const getByteSize = (s: string) => Math.round((s.length * 3) / 4);
      
      let q = 0.85;
      let result = canvas.toDataURL("image/jpeg", q);
      let iter = 0;

      while (getByteSize(result) > targetBytes && q > 0.1 && iter < 10) {
        q = Math.max(q - 0.1, 0.1);
        result = canvas.toDataURL("image/jpeg", q);
        iter++;
      }

      if (getByteSize(result) > targetBytes && width > 640) {
        const scale = Math.sqrt(targetBytes / getByteSize(result));
        const w2 = Math.max(Math.round(width * scale), 320);
        const h2 = Math.max(Math.round(height * scale), 240);
        
        const c2 = document.createElement("canvas");
        c2.width = w2; 
        c2.height = h2;
        const ctx2 = c2.getContext("2d", { alpha: false });
        if (ctx2) {
          ctx2.fillStyle = '#FFFFFF';
          ctx2.fillRect(0, 0, w2, h2);
          ctx2.drawImage(canvas, 0, 0, w2, h2);
          result = c2.toDataURL("image/jpeg", 0.7);
        }
      }

      resolve(result);
    } catch (err) {
      console.error("Error in processImageFromBase64:", err);
      resolve("");
    }
  };

  img.onerror = (err) => {
    clearTimeout(timeout);
    console.error("Image load error:", err);
    resolve("");
  };

  img.crossOrigin = "anonymous";
  img.src = base64;
}

function tryForceResize(
  base64: string,
  maxWidth: number,
  targetKB: number,
  withWatermark: boolean,
  resolve: (val: string) => void
) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = maxWidth;
    canvas.height = Math.round(maxWidth * 0.75);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) { resolve(""); return; }
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const img = new Image();
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (withWatermark) drawWatermarkSync(ctx, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      } catch { resolve(""); }
    };
    img.onerror = () => resolve("");
    img.src = base64;
    setTimeout(() => resolve(""), 8000);
  } catch { resolve(""); }
}


// Fungsi draw watermark syncronous (gambar logo bisa telat dikit atau kita skip logo kalau mau super cepat, tapi kita usahakan gambar logo jika sudah ter-cache)
function drawWatermarkSync(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const logoSize = Math.max(Math.round(W * 0.08), 24);
  const padding = Math.max(Math.round(W * 0.022), 8);
  const textSize = Math.max(Math.round(W * 0.02), 10);
  const text = APP_NAME;

  ctx.font = `bold ${textSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  const tw = ctx.measureText(text).width;
  
  // Asumsi kita gambar tanpa logo dulu untuk kecepatan, logo opsional
  const pillW = tw + padding * 2;
  const pillH = textSize * 1.5 + padding * 0.6;
  const pillX = padding;
  const pillY = padding;
  const pillR = pillH / 2;

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "rgba(10,15,35,0.82)";
  ctx.beginPath();
  ctx.moveTo(pillX + pillR, pillY);
  ctx.lineTo(pillX + pillW - pillR, pillY);
  ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR);
  ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
  ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH);
  ctx.lineTo(pillX + pillR, pillY + pillH);
  ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR);
  ctx.lineTo(pillX, pillY + pillR);
  ctx.quadraticCurveTo(pillX, pillY, pillX + pillR, pillY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${textSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pillX + padding, pillY + pillH / 2);
  ctx.restore();
}


