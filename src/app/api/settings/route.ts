/**
 * GET  /api/settings  - Ambil semua pengaturan
 * POST /api/settings  - Update pengaturan
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureSheetExists, getAllSettings, setSettingValue } from "@/lib/google";
import { DEFAULT_SETTINGS, type AppSettings, type LockMode, type ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSheetExists("Pengaturan");
    const raw = await getAllSettings();

    const settings: Omit<AppSettings, "pin" | "lockPassword" | "targetBulanan" | "batasMinSaldo"> & {
      pinSet: boolean;
      lockMode: LockMode;
      hasPassword: boolean;
    } = {
      namaUsaha: raw.namaUsaha ?? DEFAULT_SETTINGS.namaUsaha,
      namaPemilik: raw.namaPemilik ?? DEFAULT_SETTINGS.namaPemilik,
      nomorWa: raw.nomorWa ?? DEFAULT_SETTINGS.nomorWa,
      catatanWelcome: raw.catatanWelcome ?? DEFAULT_SETTINGS.catatanWelcome,
      modalAwal: Number(raw.modalAwal) || 0,
      updatedAt: raw.updatedAt ?? "",
      lockPattern: raw.lockPattern ?? DEFAULT_SETTINGS.lockPattern,
      pinSet: !!(raw.pin && raw.pin !== "000000"),
      lockMode: (raw.lockMode as LockMode) || DEFAULT_SETTINGS.lockMode,
      hasPassword: !!(raw.lockPassword && raw.lockPassword.length > 0),
    };

    return NextResponse.json({ status: "success", data: settings } satisfies ApiResponse);
  } catch (error) {
    console.error("[API/settings GET]", error);
    const message = error instanceof Error ? error.message : "Gagal mengambil pengaturan";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSheetExists("Pengaturan");
    const body = await request.json();

    // ---- Ganti PIN ----
    if (body.action === "change-pin") {
      const { currentPin, newPin } = body;
      if (!newPin || !/^\d{6}$/.test(newPin)) {
        return NextResponse.json(
          { status: "error", message: "PIN baru harus 6 digit angka." } satisfies ApiResponse,
          { status: 400 }
        );
      }
      const raw = await getAllSettings();
      const storedPin = raw.pin ?? DEFAULT_SETTINGS.pin;
      if (currentPin !== storedPin) {
        return NextResponse.json(
          { status: "error", message: "PIN lama tidak sesuai." } satisfies ApiResponse,
          { status: 403 }
        );
      }
      await setSettingValue("pin", newPin);
      await setSettingValue("updatedAt", new Date().toISOString());
      return NextResponse.json({ status: "success", message: "PIN berhasil diubah." } satisfies ApiResponse);
    }

    // ---- Ganti Sandi (password) ----
    if (body.action === "change-password") {
      const { currentCredential, newPassword } = body;
      if (!newPassword || newPassword.length < 4) {
        return NextResponse.json(
          { status: "error", message: "Sandi minimal 4 karakter." } satisfies ApiResponse,
          { status: 400 }
        );
      }
      // Verifikasi kredensial lama (bisa PIN atau password lama)
      const raw = await getAllSettings();
      const activeLockMode = (raw.lockMode as LockMode) || "pin";
      let credentialValid = false;
      if (activeLockMode === "password" && raw.lockPassword) {
        credentialValid = currentCredential === raw.lockPassword;
      } else {
        // Fallback: verifikasi dengan PIN
        credentialValid = currentCredential === (raw.pin ?? DEFAULT_SETTINGS.pin);
      }
      if (!credentialValid) {
        return NextResponse.json(
          { status: "error", message: "Kredensial lama tidak sesuai." } satisfies ApiResponse,
          { status: 403 }
        );
      }
      await setSettingValue("lockPassword", newPassword);
      await setSettingValue("lockMode", "password");
      await setSettingValue("updatedAt", new Date().toISOString());
      return NextResponse.json({ status: "success", message: "Sandi berhasil diatur." } satisfies ApiResponse);
    }

    // ---- Ganti mode kunci aktif ----
    if (body.action === "change-lock-mode") {
      const { lockMode } = body as { lockMode: LockMode };
      if (!["pin", "password", "pattern"].includes(lockMode)) {
        return NextResponse.json(
          { status: "error", message: "Mode kunci tidak valid." } satisfies ApiResponse,
          { status: 400 }
        );
      }
      await setSettingValue("lockMode", lockMode);
      await setSettingValue("updatedAt", new Date().toISOString());
      return NextResponse.json({ status: "success", message: `Mode kunci diubah ke ${lockMode}.` } satisfies ApiResponse);
    }

    // ---- Verifikasi pola lama sebelum simpan pola baru ----
    if (body.action === "change-pattern") {
      const { newPattern, currentPattern } = body as { newPattern: string; currentPattern?: string };
      if (!newPattern || typeof newPattern !== "string" || newPattern.length < 4) {
        return NextResponse.json(
          { status: "error", message: "Pola tidak valid." } satisfies ApiResponse,
          { status: 400 }
        );
      }
      // Jika ada pola lama tersimpan, wajib verifikasi dulu
      const raw = await getAllSettings();
      if (raw.lockPattern && raw.lockPattern.length > 0) {
        if (!currentPattern || currentPattern !== raw.lockPattern) {
          return NextResponse.json(
            { status: "error", message: "Pola lama tidak sesuai." } satisfies ApiResponse,
            { status: 403 }
          );
        }
      }
      await setSettingValue("lockPattern", newPattern);
      await setSettingValue("updatedAt", new Date().toISOString());
      return NextResponse.json({ status: "success", message: "Pola kunci berhasil disimpan." } satisfies ApiResponse);
    }

    // ---- Update pengaturan umum ----
    const allowedKeys: (keyof Omit<AppSettings, "pin" | "lockPassword" | "lockMode" | "updatedAt" | "targetBulanan" | "batasMinSaldo">)[] = [
      "namaUsaha", "namaPemilik", "nomorWa", "catatanWelcome", "modalAwal",
    ];
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        await setSettingValue(key, String(body[key]));
      }
    }
    await setSettingValue("updatedAt", new Date().toISOString());
    return NextResponse.json({ status: "success", message: "Pengaturan berhasil disimpan." } satisfies ApiResponse);

  } catch (error) {
    console.error("[API/settings POST]", error);
    const message = error instanceof Error ? error.message : "Gagal menyimpan pengaturan";
    return NextResponse.json({ status: "error", message } satisfies ApiResponse, { status: 500 });
  }
}
