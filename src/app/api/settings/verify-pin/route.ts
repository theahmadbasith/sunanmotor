/**
 * POST /api/settings/verify-pin
 * Verifikasi kunci masuk — support PIN, password, dan pattern
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureSheetExists, getAllSettings } from "@/lib/google";
import { DEFAULT_SETTINGS, type ApiResponse, type LockMode } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credential, mode } = body as { credential: string; mode?: LockMode };

    if (!credential || typeof credential !== "string") {
      return NextResponse.json(
        { status: "error", message: "Input tidak valid." } satisfies ApiResponse,
        { status: 400 }
      );
    }

    await ensureSheetExists("Pengaturan");
    const raw = await getAllSettings();

    // Tentukan mode aktif dari settings (default: pin)
    const activeLockMode: LockMode = (raw.lockMode as LockMode) || DEFAULT_SETTINGS.lockMode;
    // Mode yang dikirim client harus cocok dengan mode aktif di settings
    const checkMode = mode || activeLockMode;

    let isValid = false;

    if (checkMode === "pin") {
      const storedPin = raw.pin ?? DEFAULT_SETTINGS.pin;
      isValid = credential === storedPin;
    } else if (checkMode === "password") {
      const storedPassword = raw.lockPassword ?? "";
      // Jika belum ada password tersimpan, fallback ke PIN
      if (!storedPassword) {
        const storedPin = raw.pin ?? DEFAULT_SETTINGS.pin;
        isValid = credential === storedPin;
      } else {
        isValid = credential === storedPassword;
      }
    } else if (checkMode === "pattern") {
      const storedPattern = raw.lockPattern ?? DEFAULT_SETTINGS.lockPattern;
      // Jika belum ada pola tersimpan, fallback ke PIN
      if (!storedPattern) {
        const storedPin = raw.pin ?? DEFAULT_SETTINGS.pin;
        isValid = credential === storedPin;
      } else {
        isValid = credential === storedPattern;
      }
    }

    if (isValid) {
      return NextResponse.json({
        status: "success",
        message: "Verifikasi berhasil.",
        data: { lockMode: activeLockMode },
      } satisfies ApiResponse);
    } else {
      return NextResponse.json(
        { status: "error", message: "Kode salah." } satisfies ApiResponse,
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("[API/verify-pin]", error);
    return NextResponse.json(
      { status: "error", message: "Terjadi kesalahan server." } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
