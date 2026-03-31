# CCTools Network Auto Bot 🚀

CCTools Network Auto Bot adalah skrip otomasi berbasis Node.js yang dirancang untuk membantu pengguna mengumpulkan XP secara efisien melalui **Daily Check-in** dan **Project Voting (Upvote)** pada ekosistem CCTools. Skrip ini menggunakan sistem pengaman Cloudflare Turnstile Solver (SCTG) dan dukungan rotasi Proxy untuk memastikan aktivitas akun tetap aman dan lancar.

## 🌟 Fitur Utama

- **🛡️ Bypass Cloudflare**: Integrasi API SCTG/TCG untuk menyelesaikan tantangan Turnstile secara otomatis.
- **✅ Daily Check-in**: Otomatisasi klaim XP harian untuk setiap akun.
- **📈 Top Project Voting**: Memilih dan memberikan upvote pada project-project terpopuler di ekosistem berdasarkan data real-time dari Supabase.
- **🔄 Multi-Account Support**: Mendukung pemrosesan banyak akun dalam satu siklus.
- **🌐 Proxy Rotation**: Integrasi `proxies.txt` untuk menjaga anonimitas dan menghindari limitasi IP.
- **⏱️ Smart Scheduling**: Bot berjalan secara otomatis setiap 24 jam dengan jeda waktu yang manusiawi (random delay).

## 🚀 Persiapan & Instalasi

### 1. Prasyarat
- [Node.js](https://nodejs.org/) versi terbaru (v16+ direkomendasikan).
- Akun [SCTG/TCG](https://sctg.xyz/) untuk mendapatkan API Key CAPTCHA solver.

### 2. Registrasi Akun
Jika Anda belum memiliki akun, silakan mendaftar melalui link berikut untuk mendapatkan akses penuh ke ekosistem CCTools:
👉 **[Daftar di CCTools Network](https://cctools.network/signup?ref=CC-HATZQ8)**

### 3. Instalasi
```bash
# Clone repository
git clone https://github.com/Noya-xen/Cctools-Network
cd Cctools-Network

# Install dependensi
npm install
```

## ⚙️ Konfigurasi Data

### 1. `account.txt`
Masukkan data cookie akun Anda ke dalam file ini. Format yang didukung adalah string cookie lengkap yang berisi `sb-auth-token`.
*Format:* `cf_clearance=...; sb-xxxx-auth-token.0=base64-xxx; ...`

### 2. `proxies.txt`
Masukkan daftar proxy Anda (satu per baris). Format yang didukung:
`http://user:pass@host:port`

### 3. `index.js`
Buka file `index.js` dan masukkan API Key SCTG Anda pada variabel:
```javascript
const SCTG_API_KEY = 'MASUKKAN_API_KEY_SCTG_DISINI';
```

## 🛠️ Cara Menjalankan

Cukup jalankan perintah berikut di terminal:
```bash
node index.js
```
<img width="774" height="247" alt="Screenshot 2026-03-31 084257" src="https://github.com/user-attachments/assets/5c7dff41-d963-4cf7-9c4a-29b304d755d3" />


## 📜 Disclaimer
Skrip ini dibuat untuk tujuan pembelajaran dan kemudahan personal. Segala risiko yang timbul akibat penggunaan skrip ini (termasuk namun tidak terbatas pada pemblokiran akun) adalah tanggung jawab pengguna sepenuhnya. Gunakanlah secara bijak.

---
**Build with ❤️ by Noya-xen**
