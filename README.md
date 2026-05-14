# 🏍️ Sunan Motor — MotoTrack

Aplikasi pencatatan jual beli motor berbasis web untuk usaha **Sunan Motor**. Dibangun sebagai Progressive Web App (PWA) sehingga bisa diinstall di HP dan digunakan layaknya aplikasi native.

---

## ✨ Fitur Utama

### 📊 Dashboard Keuangan
- **Saldo Tersedia** — Pantau saldo real-time dengan tombol hide/show untuk privasi
- **Formula saldo**: `Modal Awal + Total Jual − Total Modal − Pengeluaran − Nilai Stok`
- **Total Jual / Profit / Pengeluaran / Nilai Stok** — Ringkasan keuangan lengkap
- **Aktivitas Terbaru** — 10 transaksi terakhir (jual, beli, pengeluaran), tap untuk detail
- **Navigasi Cepat** — Tap kartu untuk langsung ke menu terkait

### 🏍️ Manajemen Motor

**Beli Motor**
- Catat pembelian motor baru (nama, harga beli, tanggal)
- Upload foto dari kamera atau galeri (maks 5 foto)
- Foto otomatis dikompresi + watermark "Sunan Motor"
- Motor masuk ke daftar stok dengan status `stok`
- **Pembelian otomatis mengurangi saldo** — harga beli langsung diperhitungkan ke saldo kas

**Jual Motor — 2 cara:**

1. **Lanjut Jual dari Riwayat** — Tap "Lanjut Jual" di tab Beli, data motor terisi otomatis, status di sheet Pembelian berubah ke `terjual`
2. **Jual Langsung dari menu Jual** — Isi data motor baru, sistem otomatis membuat record di sheet Pembelian dengan ID baru dan status `terjual`

Kedua cara selalu menghasilkan record di **sheet Penjualan** dan **sheet Pembelian** secara terintegrasi.

### 📷 Kamera & Foto
- **Kamera langsung** — Ambil foto dari kamera HP dengan panduan frame 3:4
- **Flash/Torch** — Nyalakan lampu flash (jika perangkat mendukung)
- **Pinch-to-Zoom** — Zoom kamera dengan dua jari + slider zoom
- **Flash effect** — Efek kilat saat foto diambil
- **Galeri** — Pilih dari galeri, support HEIC/HEIF
- **Drag reorder** — Geser thumbnail untuk ubah urutan foto
- **Preview fullscreen** — Tap foto untuk lihat detail, zoom, swipe antar foto
- **Hapus foto** — Hapus dari grid atau dari dalam preview

### 💰 Pengeluaran
- Catat pengeluaran operasional (sewa, listrik, bensin, gaji, dll.)
- Pilih tanggal pengeluaran (bisa mundur)
- Riwayat pengeluaran lengkap

### 📋 Riwayat Transaksi
- **3 tab**: Jual · Beli · Pengeluaran
- **Card collapsible** — Tap card untuk buka/tutup detail lengkap
- **Detail jual**: Harga Beli, Biaya Reparasi, Total Modal, Harga Jual, Untung Bersih
- **Detail beli**: Harga Beli, Status badge (`Stok` oranye / `Terjual` hijau), tombol Lanjut Jual
- **Tombol Lanjut Jual** — Hanya muncul untuk motor berstatus `stok`
- **Swipe kiri/kanan** — Pindah antar tab dengan gesture
- **Lihat foto** — Tap thumbnail untuk buka preview fullscreen
- **Hapus data** — Hapus transaksi dengan konfirmasi

### 📊 Laporan Keuangan
- **Periode fleksibel**: 7 hari terakhir, 30 hari terakhir, atau custom
- **Ringkasan lengkap**: Harga Beli, Reparasi, Modal, Penjualan, Profit Kotor, Pengeluaran, Nilai Stok, **Laba Bersih**
- **Cetak PDF** — Layout A4 portrait dengan 3 tabel:
  - Daftar Rincian Penjualan (per unit: Beli, Reparasi, Modal, Jual, Profit)
  - Daftar Pengeluaran Operasional
  - **Daftar Stok Motor Aktif** (motor yang belum terjual + total nilai stok)
- **Kirim via WhatsApp** — Laporan terformat lengkap termasuk section **STOK MOTOR AKTIF**

### 🔒 Keamanan
- **Lock Screen** — Proteksi akses dengan 3 mode:
  - **PIN** (6 digit angka, default: `000000`)
  - **Password** (alphanumeric)
  - **Pattern** (pola 3×3 grid)
- Session otomatis berakhir saat tutup aplikasi

### 📱 PWA & Offline
- **Install di HP** — Bisa diinstall di Android/iOS seperti aplikasi native
- **Offline Support** — Bekerja tanpa koneksi, data tersinkron saat online
- **Auto Sync** — Antrian sinkronisasi otomatis saat koneksi kembali
- **Form Cache** — Draft form tersimpan otomatis di IndexedDB

### 🧭 Navigasi
- **Bottom Navigation** — 6 menu: Beranda · Beli · Jual · Keluar · Riwayat · Laporan
- **Swipe global** — Geser layar kiri/kanan untuk pindah tab

### ⚙️ Pengaturan
- Nama Usaha, Nama Pemilik, Nomor WhatsApp
- **Modal Awal** — Mempengaruhi perhitungan saldo dashboard secara real-time
- Ganti mode kunci (PIN / Password / Pattern)

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) |
| UI | React 19 + Tailwind CSS 3 |
| Database | Google Sheets (Sheets API v4) |
| Storage Foto | Google Drive (Drive API v3) |
| Auth | Google Service Account |
| Deployment | Vercel |
| PWA | Service Worker + Web Manifest |
| Offline | IndexedDB + Background Sync |
| Foto | Canvas API (kompresi + watermark) |

---

## 📋 Prasyarat

1. **Akun Google** dengan akses ke Google Cloud Console
2. **Node.js** v20 atau lebih baru
3. **Akun Vercel** (untuk deployment)

---

## ⚙️ Setup Google Cloud

### 1. Aktifkan API

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih yang sudah ada
3. Aktifkan:
   - **Google Sheets API**
   - **Google Drive API**

### 2. Buat Service Account

1. **IAM & Admin → Service Accounts → Create Service Account**
2. Isi nama → Create and Continue → Done
3. Klik service account → tab **Keys → Add Key → Create new key → JSON**
4. Simpan file JSON — ini adalah `GOOGLE_SERVICE_ACCOUNT_JSON`

### 3. Buat Google Spreadsheet

1. Buat spreadsheet baru di [Google Sheets](https://sheets.google.com/)
2. Ambil **Spreadsheet ID** dari URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```
3. Share ke `client_email` dari file JSON dengan akses **Editor**

### 4. Buat Folder Google Drive

1. Buat folder baru di [Google Drive](https://drive.google.com/)
2. Ambil **Folder ID** dari URL:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID
   ```
3. Share ke `client_email` dari file JSON dengan akses **Editor**

---

## 🚀 Instalasi Lokal

```bash
# Clone
git clone https://github.com/theahmadbasith/sunantrack.git
cd sunantrack

# Install dependencies
npm install

# Konfigurasi environment
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Service Account JSON (satu baris, tanpa line break)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# ID Folder Google Drive untuk foto motor
FOLDER_UTAMA_ID=1aBcDeFgHiJkLmNoPqRsTuVwXyZ

# ID Google Spreadsheet
SPREADSHEET_ID=1aBcDeFgHiJkLmNoPqRsTuVwXyZ
```

> **Penting:** `GOOGLE_SERVICE_ACCOUNT_JSON` harus berupa JSON valid dalam **satu baris** (hapus semua newline dari file `.json` yang didownload).

```bash
# Jalankan development server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

---

## 🌐 Deployment ke Vercel

```bash
git add .
git commit -m "initial commit"
git push origin main
```

1. Buka [vercel.com](https://vercel.com/) → **Add New → Project**
2. Import repository dari GitHub
3. Tambahkan **Environment Variables**:

| Key | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Isi JSON service account (satu baris) |
| `FOLDER_UTAMA_ID` | ID folder Google Drive |
| `SPREADSHEET_ID` | ID Google Spreadsheet |

4. Klik **Deploy**

---

## 📱 Instalasi sebagai PWA

**Android (Chrome)**
1. Buka URL aplikasi di Chrome
2. Tap **⋮ → Add to Home Screen**

**iOS (Safari)**
1. Buka URL aplikasi di Safari
2. Tap **Share → Add to Home Screen**

---

## 🗂️ Struktur Database (Google Sheets)

Sheet dibuat otomatis saat pertama kali digunakan.

### Sheet: `Pembelian`
| Kolom | Keterangan |
|---|---|
| ID | ID unik (`BLI-XXXXX`) |
| Tanggal | Format readable WIB |
| Nama Motor | Nama/tipe/tahun |
| Harga Beli | Format `Rp xxx.xxx` |
| Foto URLs | URL Google Drive (dipisah koma) |
| Folder ID | Nama subfolder Drive |
| Status | `stok` / `terjual` |
| ID Jual | Referensi ke ID di sheet Penjualan |

> Record dibuat otomatis saat jual langsung dari menu Jual (status langsung `terjual`).

### Sheet: `Penjualan`
| Kolom | Keterangan |
|---|---|
| ID | ID unik (`MTR-XXXXX`) |
| Tanggal | Format readable WIB |
| Nama Motor | Nama/tipe/tahun |
| Harga Beli | Format `Rp xxx.xxx` |
| Biaya Reparasi | Format `Rp xxx.xxx` |
| Total Modal | Harga Beli + Reparasi |
| Harga Jual | Format `Rp xxx.xxx` |
| Untung Bersih | Harga Jual − Total Modal |
| Foto URLs | URL Google Drive (dipisah koma) |
| Folder ID | Nama subfolder Drive |
| ID Beli | Referensi ke ID di sheet Pembelian |

### Sheet: `Pengeluaran`
| Kolom | Keterangan |
|---|---|
| ID | ID unik (`EXP-XXXXX`) |
| Tanggal | Format readable WIB |
| Keperluan | Deskripsi pengeluaran |
| Nominal | Format `Rp xxx.xxx` |

### Sheet: `Pengaturan`
| Key | Keterangan |
|---|---|
| `pin` | PIN 6 digit (default: `000000`) |
| `lockMode` | `pin` / `password` / `pattern` |
| `lockPassword` | Sandi teks |
| `lockPattern` | Pola angka |
| `namaUsaha` | Nama usaha |
| `namaPemilik` | Nama pemilik |
| `nomorWa` | Nomor WhatsApp |
| `modalAwal` | Modal awal usaha (mempengaruhi saldo) |
| `catatanWelcome` | Catatan/motto |

---

## 💡 Logika Saldo

```
Saldo = modalAwal + totalHargaJual - totalModal - totalPengeluaran - totalHargaBeliStok
```

| Komponen | Keterangan |
|---|---|
| `modalAwal` | Diatur di Pengaturan, langsung mempengaruhi saldo |
| `totalHargaJual` | Akumulasi harga jual semua motor yang sudah terjual |
| `totalModal` | Akumulasi total modal (beli + reparasi) motor yang sudah terjual |
| `totalPengeluaran` | Akumulasi semua pengeluaran operasional |
| `totalHargaBeliStok` | Akumulasi harga beli motor berstatus `stok` (belum terjual) |

Saat motor terjual, `totalHargaBeliStok` berkurang otomatis karena statusnya berubah dari `stok` ke `terjual`.

---

## 📸 Cara Kerja Upload Foto

1. Foto diambil dari kamera atau galeri
2. Dikompresi di browser (maks 1280px, target ≤500KB) + watermark "Sunan Motor"
3. Dikirim sebagai base64 ke API Next.js
4. API upload ke subfolder Google Drive via Service Account
5. URL thumbnail disimpan di Google Sheets

---

## 💾 Auto-Save Form

Form input tersimpan otomatis di **IndexedDB** browser:
- Tersimpan setiap 800ms setelah perubahan (debounced)
- Dilanjutkan otomatis jika pindah tab atau refresh
- Terhapus otomatis setelah submit berhasil
- Bekerja offline

---

## 📜 Scripts

```bash
npm run dev      # Development server
npm run build    # Build production
npm run start    # Production server
npm run lint     # ESLint
```

---

## 🔐 Keamanan

- Verifikasi kunci dilakukan di server (tidak dikirim ke client)
- Service Account credentials disimpan sebagai environment variable
- `.env.local` sudah masuk `.gitignore`
- Session berbasis `sessionStorage` (otomatis berakhir saat tutup browser)

---

## 🆕 Changelog

### v4.0.0 (Latest)
- ✅ **Integrasi beli-jual** — Setiap penjualan selalu membuat/memperbarui record di sheet Pembelian
- ✅ **Jual langsung** — Jual dari menu Jual otomatis membuat ID beli baru di sheet Pembelian (status `terjual`)
- ✅ **Beli mengurangi saldo** — Harga beli motor stok langsung diperhitungkan ke saldo kas
- ✅ **Stok di laporan PDF** — Tabel "Daftar Stok Motor Aktif" di laporan cetak
- ✅ **Stok di laporan WA** — Section "STOK MOTOR AKTIF" di pesan WhatsApp
- ✅ **Badge status di riwayat beli** — Badge `Stok` (oranye) dan `Terjual` (hijau)
- ✅ **Modal awal real-time** — Ubah modal awal di pengaturan langsung update saldo dashboard
- ✅ **Hapus fitur voice** — Antarmuka lebih bersih, 6 tab navigasi rata
- ✅ **Formula saldo transparan** — Label saldo menampilkan komponen perhitungan

### v3.0.0
- ✅ Swipe navigasi global — Geser layar kiri/kanan untuk pindah tab
- ✅ Riwayat collapsible — Card tertutup by default, tap untuk buka detail
- ✅ Detail lengkap di riwayat — Harga Beli, Reparasi, Modal, Jual, Untung Bersih
- ✅ Kamera maksimal — Flash/torch, pinch-to-zoom, slider zoom, flash effect
- ✅ Tanggal di semua form — Beli, Jual, dan Pengeluaran bisa pilih tanggal
- ✅ PDF landscape A4 — Tabel laporan penuh

### v2.0.0
- ✅ Hapus data di riwayat
- ✅ Hide/show nominal di dashboard
- ✅ Lock screen (PIN, Password, Pattern)
- ✅ Form beli motor terpisah
- ✅ Lanjut jual dari stok
- ✅ WhatsApp integration

### v1.0.0
- 🎉 Initial release — Dashboard, input motor, upload foto, tarik saldo, riwayat, PIN, PWA

---

## 📄 Lisensi

Proyek ini bersifat privat untuk keperluan internal usaha **Sunan Motor**.

---

**Dibuat dengan ❤️ untuk Sunan Motor**
