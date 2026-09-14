# PRD — DompetKita (Couple Finance Tracker)

## Original Problem Statement
Aplikasi mobile (Android & iOS) untuk mencatat keuangan bersama pasangan: dua akun terhubung dalam satu "ruang keuangan bersama", mencatat pemasukan & pengeluaran, sinkron real-time tanpa refresh manual, notifikasi saat pasangan menambah transaksi, dashboard dengan grafik, anggaran per kategori dengan peringatan, riwayat dengan pencarian & filter, upload foto struk. UI minimalis profesional, palet netral + aksen emerald, bottom navigation 5 tab, dark mode.

## User Personas
- **Pasangan muda Indonesia (2 user)** yang mengelola uang bersama (rumah tangga, pacar, keluarga kecil): ingin transparansi pengeluaran tanpa admin yang rumit.
- Peran simetris: siapa pun bisa mencatat; setiap transaksi menampilkan siapa yang input (Kamu / Pasangan).

## User Choices (dari user)
- Aksen: **Emerald** (#047857 light / #10B981 dark)
- Notifikasi: **in-app notification center + Emergent managed push** (push aktif setelah deploy + build; butuh google-services.json dari user)
- **Dark + Light mode** dengan toggle di Profil
- Bahasa UI: **Bahasa Indonesia**

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`, port 8001, semua route di bawah `/api`) + MongoDB (motor). JWT (PyJWT, 30 hari) + bcrypt. Emergent Object Storage untuk foto struk (proxy via backend). Emergent push relay (SuprSend) — `POST /api/register-push` + `send_push()` non-blocking.
- **Frontend**: Expo SDK 57 + expo-router (file-based). 5 tab (Beranda, Tambah, Riwayat, Anggaran, Profil; NativeTabs di iOS 26+, Tabs JS di lainnya). Data via @tanstack/react-query dengan polling 4 detik (real-time feel) + invalidation setelah mutasi. Charts: react-native-gifted-charts. Keyboard: react-native-keyboard-controller. Font: Plus Jakarta Sans (expo-font). Tema light/dark di `src/theme.ts` (override + listener karena RN-web tak mendukung Appearance.setColorScheme).
- **Data model** (MongoDB, soft-delete `deleted_at` di semua koleksi): users (email/phone unik parsial, wallet_id), wallets (member_ids max 2, invite_code 6 digit + expiry 24 jam), categories (default 8 per wallet + kustom), transactions (amount IDR int, type, category denormalized, date YYYY-MM-DD, note, created_by, receipt_path), budgets (wallet+category+month, limit, warned_80/warned_100 flags), notifications (per user), files (path → wallet ownership).

## Core Requirements (static)
1. Auth email/no HP + password (JWT)
2. Pairing via kode undangan 6 digit (join = merge kategori/anggaran/migrasi transaksi ke dompet bersama)
3. CRUD transaksi + kategori kustom + foto struk (opsional, max 5MB)
4. Real-time sync antar pasangan (polling 4s, tanpa refresh manual)
5. Notifikasi in-app + push saat: pasangan menambah transaksi, anggaran 80%/100%, pasangan bergabung
6. Dashboard: saldo bersama, pemasukan/pengeluaran (harian/mingguan/bulanan), filter Gabungan/Kamu/Pasangan, pie chart kategori, line chart tren 6 bulan
7. Anggaran per kategori per bulan, progress bar berubah warna (emerald → warning ≥80% → error >100%), banner peringatan
8. Riwayat: pencarian (note/kategori), filter owner/bulan/kategori, grouping per hari + total harian, detail sheet + hapus (soft delete)

## Implemented (2026-09-14)
- [x] Backend lengkap: auth, pairing+merge, categories, transactions, summary, budgets+alerts, notifications, upload/files, register-push, send_push (19/19 pytest pass)
- [x] Frontend lengkap: gate, login, register, 5 tab, notifications screen, AuthGate, Toast, SheetModal, komponen UI, polling real-time, dark mode persist
- [x] Objek storage upload → download (header & ?token= query) round-trip 200
- [x] Real-time sync terverifikasi: transaksi Budi muncul di Riwayat Sari tanpa refresh
- [x] Dark mode terverifikasi di web + persist setelah reload
- [x] Testing agent iteration 1: 2 bug diperbaiki (files route positional-args 502; tab button testID)
- [x] **Edit Transaksi (2026-09-14)**: PATCH /api/transactions/{id} + mode edit di sheet detail riwayat (nominal, kategori, catatan) — 14/14 pytest + E2E pass, budget flags ikut naik/turun
- [x] **Fix overlay merah console (2026-09-14)**: svg-web-shim.web.ts menghapus props touchable/responder dari SVG shapes di web (gifted-charts) — 0 console.error, grafik tetap render
- [x] **Fix error jaringan (2026-09-14)**: apiFetch menangkap kegagalan koneksi → pesan ramah "Tidak bisa terhubung ke server..." (kasus user: error saat join terjadi karena service di-restart sementara; join mereka ternyata sukses di DB)
- [x] **Fix loading lama di Expo Go (2026-09-14)**: akar masalah = kompilasi dev-bundle pertama (~10MB) via tunnel + restart service; bundle android/iOS sudah di-warm (0.07s warm) + font-fallback 8 detik di _layout agar app tak bisa terkunci di splash bila asset font gagal dimuat. Solusi permanen untuk daily use: deploy + production build.
- [x] **Fix crash Expo Go (2026-09-14)**: push.ts memanggil API notifikasi Android yang dihapus dari Expo Go (SDK 53) di module scope → root layout gagal dimuat (error berantai "missing default export", "ErrorBoundary of undefined"). Semua panggilan expo-notifications kini digate `Constants.appOwnership !== 'expo'` + try/catch; dibuktikan via runtime harness (module aman dievaluasi di lingkungan yang meniru Expo Go). Push tetap aktif di dev/production build setelah deploy.
- [x] **Fix crash Expo Go versi 2 (2026-09-14, iter-6)**: IMPORT `expo-notifications` itu sendiri melempar error di Expo Go (side-effect modul DevicePushTokenAutoRegistration.fx.js) — gating panggilan tidak cukup. Kini library di-`require` secara lazy HANYA di native dev/production build; di Expo Go kodenya tak pernah dieksekusi. Verifikasi iter-6: harness 2 arah lulus, grep bebas import statis lain, bundle android warm 0,55s, regresi web bersih.
- [x] **Fix "Property StyleSheet doesn't exist" (2026-09-14, iter-7)**: ui.tsx memakai StyleSheet tanpa import (tertutupi crash push sebelumnya) + tambah.tsx kehilangan import Image + perbaikan tipe menyeluruh (NativeTabs Icon/Label dari NativeTabs.Trigger, prop chart centerText→centerLabelComponent, xAxisTextStyle→labelTextStyle, theme.setColorScheme 'unspecified'). `tsc --noEmit` 100% bersih, eslint bersih, semua layar render normal.

## Prioritized Backlog
- **P0** (sebelum produksi): user menyediakan `google-services.json` (Firebase) → push Android aktif setelah Publish + build; iOS butuh APNs key saat build
- **P1**: export laporan (CSV/PDF); notifikasi digester harian
- **P2**: multi-currency, wallet > 2 anggota (keluarga), split bills, widget ringkasan, laporan periodis kustom

## Next Tasks
- Minta google-services.json dari user → taruh `frontend/google-services.json` → deploy + build agar push notifikasi jalan di perangkat asli
- Export laporan bulanan
