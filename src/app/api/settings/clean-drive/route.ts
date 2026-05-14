import { NextResponse } from "next/server";
import { cleanOrphanedFolders } from "@/lib/google";
import { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await cleanOrphanedFolders();
    
    if (result.error) {
      return NextResponse.json(
        { status: "error", message: result.error } satisfies ApiResponse,
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        status: "success", 
        message: `Berhasil membersihkan Drive. Memindahkan ${result.moved} folder yatim piatu ke HAPUS.` 
      } satisfies ApiResponse
    );
  } catch (error) {
    console.error("[API/clean-drive POST] Error:", error);
    const message = error instanceof Error ? error.message : "Terjadi kesalahan sistem";
    return NextResponse.json(
      { status: "error", message } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
