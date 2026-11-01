# 🌳 Mening Shajaram — Ota, Ona va Avlodlar Milliy Solnomasi

Interaktiv, erkin tahrirlanuvchi, Node.js + Express + SQLite asosidagi toʻliq backend bilan boyitilgan oila shajarasi veb-ilovasi.

Foydalanuvchi oʻz ajdodlari va avlodlari zanjirini cheksiz kiritishi, har bir oila juftligiga (ota va ona) istalgancha farzand qoʻshishi, tahrirlashi, oʻchirishi va barcha maʼlumotlarni backend SQLite maʼlumotlar bazasida xavfsiz saqlashi mumkin.

---

## ✨ Asosiy Imkoniyatlar

1. **🔗 Kuchli Backend va Maʼlumotlar Bazasi (Node.js + Express + PostgreSQL / SQLite)**:
   - **Doimiy Bulut Bazasi (Real Cloud Database)**: PostgreSQL (Neon, Supabase, Railway, Vercel Postgres) yoki Turso orqali 100% ishonchli, serverless muhitda ham hech qachon o'chib ketmaydigan doimiy saqlash.
   - **Avtomatik sinxronizatsiya**: Har bir qoʻshilgan farzand, tahrir va oʻzgarish toʻgʻridan-toʻgʻri bazadagi `trees`, `users` va `members` jadvallariga saqlanadi.
   - **Lokal va Oflayn moslashuvchanlik**: Agar bulut bazasi ko'rsatilmasa, ilova lokal `shajara.db` orqali ishlaydi. Serverga ulanish uzilsa, `localStorage` zaxirasi ishga tushadi.
   - **Server va Baza holati indikatori**: Sahifada real vaqtda server va ulanish holati (🟢 Serverga ulangan (PostgreSQL) / 🟡 Oflayn rejim / 🔄 Saqlanmoqda) aks etadi.

2. **👤 Foydalanuvchilar va Shaxsiy Shajaralar**:
   - **Mehmon rejimi (Guest)**: Roʻyxatdan oʻtmasdan darhol umumiy shajarani koʻrish va tahrirlash imkoniyati.
   - **Kirish va Roʻyxatdan oʻtish (JWT Auth)**: Istalgan foydalanuvchi oʻz hisobini yaratib, oʻzining shaxsiy shajarasini yaratishi va boshqarishi mumkin.
   - Namunaviy sinov hisobi: `anvar_qodirov` / parol: `123456`.

3. **🌿 Cheklovsiz Shajaraviy Tuzilma (Ota, Ona va Bolalar)**:
   - Bosh ajdodlar (Root) yuqorida, ularning ostida farzandlar, nabiralar va cheksiz keyingi avlodlar.
   - Ota va Ona (ayoli) yonma-yon uzuk rishtasi (💍) bilan bogʻlangan holda koʻrsatiladi.
   - Aka-uka va opa-singillar tugʻilgan yili boʻyicha avtomatik tartiblanadi.
   - Kartochkalar ustma-ust tushmaydi, silliq SVG/CSS ulanish chiziqlari bilan bogʻlanadi.

4. **⚡ Interaktiv Amallar**:
   - **`+ Farzand`**: Ushbu oila juftligiga yangi farzand va uning turmush oʻrtogʻini kiritish.
   - **`Tahrir`**: Ism, tugʻilgan yili, vafot yili va ayoli maʼlumotlarini oʻzgartirish.
   - **`Oʻchir`**: Shaxs va uning barcha avlodlarini oʻchirish (tasdiqlash bilan).
   - **`↺ Namunaga qaytarish`**: Istalgan vaqtda shajarani namunaviy 4 avlodli oilaga qaytarish.
   - **`💾 Eksport & Zaxira`**:
     * JSON zaxira fayl yuklab olish.
     * JSON fayldan qayta tiklash.
     * Rasm (PNG) sifatida yuklab olish (html2canvas).
     * Chop etish / PDF formatida saqlash.

5. **🎨 Nafis Milliy Dizayn & Qulayliklar**:
   - Zangori-yashil (emerald), feruza va tilla ohanglaridagi milliy uslub.
   - **Kunduzgi (Light) va Tungi (Dark)** rejimlar.
   - Zoom (+, -, 100%, Markazga qaytarish) va Drag-to-Pan boshqaruvi.
   - Ism va yil boʻyicha tezkor qidiruv.

---

## 🚀 Ishga Tushirish

### 1. Bogʻliqliklarni oʻrnatish:
```bash
npm install
```

### 2. Serverni ishga tushirish:
```bash
npm start
```

Brauzerda quyidagi manzilni oching:
👉 **http://localhost:3000**

### 3. Testlarni ishga tushirish:
```bash
npm test
```
va jonli E2E HTTP testlari:
```bash
npm run test:e2e
```

---

## 🗄️ Real Database (PostgreSQL / Neon / Supabase) Sozlash

Vercel yoki boshqa Serverless platformalarda SQLite fayli (`/tmp`) server uxlaganda o'chib ketmasligi uchun doimiy PostgreSQL bazasi ulanadi:

### 1. Bepul PostgreSQL bazasi ochish:
- [Neon.tech](https://neon.tech) (tavsiya: 30 soniyada bepul serverless PostgreSQL beradi) yoki [Supabase.com](https://supabase.com).
- Yangi loyiha ochib, berilgan connection string (`DATABASE_URL`) dan nusxa oling.

### 2. Loyihaga kiritish:
`.env` fayliga yoki Vercel Environment Variables ga qo'shing:
```env
DATABASE_URL=postgresql://foydalanuvchi:parol@ep-xyz.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

### 3. Mavjud SQLite ma'lumotlarini PostgreSQL ga ko'chirish:
```bash
npm run db:migrate
```
Ushbu buyruq `shajara.db` dagi barcha foydalanuvchilar, daraxtlar va oila a'zolarini yangi PostgreSQL bazangizga to'liq va xatosiz o'tkazadi!

---

| Metod | Marshrut | Tavsif |
|---|---|---|
| `GET` | `/api/health` | Server holatini tekshirish |
| `GET` | `/api/tree` | Faol shajarani olish (umumiy yoki profilga tegishli) |
| `PUT` | `/api/tree` | Shajarani toʻliq saqlash va sinxronlash |
| `POST` | `/api/tree/child` | Ota-onaga yangi farzand qoʻshish |
| `PUT` | `/api/tree/person/:id` | Oila aʼzosi maʼlumotlarini yangilash |
| `DELETE`| `/api/tree/person/:id` | Aʼzo va uning barcha avlodlarini oʻchirish |
| `POST` | `/api/tree/reset` | Namunaviy holatga tiklash |
| `POST` | `/api/tree/import` | JSON formatida shajarani import qilish |
| `GET` | `/api/tree/export` | JSON formatida eksport qilib yuklab olish |
| `GET` | `/api/tree/stats` | Shajara statistikasi (aʼzolar, avlodlar soni) |
| `POST` | `/api/auth/register` | Yangi foydalanuvchi roʻyxatdan oʻtkazish |
| `POST` | `/api/auth/login` | Tizimga kirish (JWT token) |
| `GET` | `/api/auth/me` | Joriy profil maʼlumotlarini olish |

---

## 📂 Fayllar Strukturasi

- `server.js` — Express backend server va marshrutlar ulanishi.
- `db.js` — SQLite maʼlumotlar bazasi initsializatsiyasi va jadvallar (`trees`, `users`, `members`).
- `sampleData.js` — Standart namunaviy shajara maʼlumotlari.
- `routes/tree.js` — Shajara CRUD va sinxronlash API marshrutlari.
- `routes/auth.js` — JWT autentifikatsiya (kirish, roʻyxatdan oʻtish) marshrutlari.
- `public/index.html` va `index.html` — Toʻliq frontend interfeys, daraxt renderi va API mijoz kodi.
- `test/api.test.js` — Backend API unit testlari.
- `test/e2e.test.js` — Jonli E2E HTTP integratsiya testlari.
