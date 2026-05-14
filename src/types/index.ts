// ============================================================
// TIPE DATA UTAMA APLIKASI SUNAN MOTOTRACK
// ============================================================

/** Satu item detail biaya restorasi, misal: { nama: "Oli", biaya: 100000 } */
export interface DetailRestorasi {
  nama: string;
  biaya: number;
}

export interface MotorBeliData {
  id: string;
  tanggal: string;
  namaMotor: string;
  hargaBeli: number;
  fotos: string[];
  folderId?: string;
  status: "stok" | "terjual"; // stok = belum dijual, terjual = sudah dijual
  idJual?: string; // referensi ke record penjualan
  /** Detail item biaya restorasi (opsional, bisa lebih dari 1) */
  detailRestorasi?: DetailRestorasi[];
  /** Total biaya restorasi (sum dari detailRestorasi, atau input manual) */
  biayaRestorasi?: number;
}

export interface MotorData {
  id: string;
  tanggal: string;          // tanggal jual
  tanggalBeli?: string;     // tanggal beli (opsional, dari record beli)
  namaMotor: string;
  hargaBeli: number;
  biayaReparasi: number;    // alias lama, tetap dipertahankan untuk kompatibilitas
  /** Detail item biaya restorasi */
  detailRestorasi?: DetailRestorasi[];
  totalModal: number;
  hargaJual: number;
  untungBersih: number;
  fotos: string[];
  folderId?: string;
  idBeli?: string;          // referensi ke record beli
}

export interface PengeluaranData {
  id: string;
  tanggal: string;
  keperluan: string;
  nominal: number;
  fotos: string[];
  folderId?: string;
}

export interface DashboardData {
  saldo: number;
  totalKeuntungan: number;
  totalPengeluaran: number;
  totalModal: number;
  totalHargaJual: number;
  totalMotor: number;
  totalStok: number;
  totalHargaBeliStok: number;
  recent: RecentTransaction[];
}

export interface RecentTransaction {
  id: string;
  type: "income" | "expense" | "beli";
  title: string;
  amount: number;
  date: string;
  detail?: string;
  fotos?: string[];
  /** Detail item restorasi (hanya untuk type "beli" yang masih stok) */
  detailRestorasi?: DetailRestorasi[];
  biayaRestorasi?: number;
  namaMotor?: string;
}

export interface ApiResponse<T = unknown> {
  status: "success" | "error";
  message?: string;
  data?: T;
}

export interface SubmitMotorBeliPayload {
  namaMotor: string;
  hargaBeli: number;
  tanggal?: string;
  fotos: FotoUpload[];
}

export interface SubmitMotorPayload {
  namaMotor: string;
  hargaBeli: number;
  biayaReparasi: number;
  /** Detail item restorasi (opsional) */
  detailRestorasi?: DetailRestorasi[];
  hargaJual: number;
  tanggal?: string;
  fotos: FotoUpload[];
  idBeli?: string;
}

/** Payload untuk update biaya restorasi pada record beli yang sudah ada */
export interface UpdateRestorasiPayload {
  idBeli: string;
  detailRestorasi: DetailRestorasi[];
  biayaRestorasi: number;
}

export interface FotoUpload {
  name: string;
  base64: string;
}

export interface SubmitPengeluaranPayload {
  keperluan: string;
  nominal: number;
  tanggal?: string;
  fotos?: FotoUpload[];
}

// ============================================================
// KOLOM GOOGLE SHEET
// ============================================================

export const SHEET_MOTOR_BELI_COLS = {
  ID: 0,
  TANGGAL: 1,
  NAMA_MOTOR: 2,
  HARGA_BELI: 3,
  FOTOS: 4,
  FOLDER_ID: 5,
  STATUS: 6,
  ID_JUAL: 7,
  BIAYA_RESTORASI: 8,
  DETAIL_RESTORASI: 9,
} as const;

export const SHEET_MOTOR_COLS = {
  ID: 0,
  TANGGAL: 1,
  NAMA_MOTOR: 2,
  HARGA_BELI: 3,
  BIAYA_REPARASI: 4,
  TOTAL_MODAL: 5,
  HARGA_JUAL: 6,
  UNTUNG_BERSIH: 7,
  FOTOS: 8,
  FOLDER_ID: 9,
  ID_BELI: 10,
  DETAIL_RESTORASI: 11,
} as const;

export const SHEET_PENGELUARAN_COLS = {
  ID: 0,
  TANGGAL: 1,
  KEPERLUAN: 2,
  NOMINAL: 3,
  FOTOS: 4,
  FOLDER_ID: 5,
} as const;

export const SHEET_NAMES = {
  MOTOR_BELI: "Pembelian",
  MOTOR: "Penjualan",
  PENGELUARAN: "Pengeluaran",
  PENGATURAN: "Pengaturan",
} as const;

// ============================================================
// PENGATURAN / SETTINGS
// ============================================================

export type LockMode = "pin" | "password" | "pattern";

export interface AppSettings {
  pin: string;
  lockMode: LockMode;       // mode kunci aktif: pin | password | pattern
  lockPassword: string;     // sandi teks
  lockPattern: string;      // pola kunci dalam format base64 encoded string
  namaUsaha: string;
  namaPemilik: string;
  nomorWa: string;
  catatanWelcome: string;
  modalAwal: number;        // modal awal usaha (mempengaruhi saldo)
  updatedAt: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pin: "000000",
  lockMode: "pin",
  lockPassword: "",
  lockPattern: "",
  namaUsaha: "Sunan Motor",
  namaPemilik: "",
  nomorWa: "",
  catatanWelcome: "",
  modalAwal: 0,
  updatedAt: "",
};

export const SHEET_PENGATURAN_COLS = {
  KEY: 0,
  VALUE: 1,
  UPDATED_AT: 2,
} as const;
