# EMR

Brauzerda ishlaydigan, oddiy va tez video-editor. Client-side montaj (video/rasm yuklash, multi-clip timeline, musiqa qo'shish, kesish (split), trim va WebM formatda eksport), loyihalar esa Google orqali kirib **Supabase**da (Database + Storage) saqlanadi — istalgan qurilmadan kirib davom ettirish mumkin.

## 📁 Loyiha strukturasi

```
video-editor/
├── index.html              # Editor (asosiy sahifa, "/") — barcha CSS/JS shu yerga ulanadi
├── login/index.html        # Kirish sahifasi       -> /login/
├── terms/index.html        # Foydalanish shartlari -> /terms/
├── privacy/index.html      # Maxfiylik siyosati    -> /privacy/
├── vercel.json              # Build + eski .html manzillardan yangilariga redirect
├── favicon.ico              # Favicon (16/32/48) — EMR logosi
├── assets/                   # logo.png, apple-touch-icon.png, favicon-32.png, transition-preview-a/b.jpg (transition toast preview kadrlari)
├── README.md                # Shu fayl
│
├── css/                      # Uslublar — mantiqiy bo'limlarga ajratilgan
│   ├── base.css               # Reset, body, global scrollbar
│   ├── upload.css             # Yuklash ekrani (drag&drop box)
│   ├── preview.css            # Video preview, play controls
│   ├── toolbar.css            # Tool button'lar (add/music/split)
│   ├── timeline.css           # Timeline panel, header, zoom, export tugma
│   ├── timeline-scrollbar.css # Timeline'ning maxsus scrollbar'i
│   ├── media-blocks.css       # Clip bloklari, playhead, trim handle, context-menu
│   ├── transition-toast.css   # Transition panel-toast (tur kartalari + davomiylik slideri)
│   ├── responsive.css         # Umumiy tuzatishlar + telefon/landscape moslashuvi
│   └── tablet.css             # PLANSHET (iPad, Android tab): touch, 641px+ — dashboard, editor, panellar
│
└── js/                       # Mantiq — har bir fayl bitta vazifaga javobgar
    ├── state.js                # Global state obyekti + yordamchi getter'lar + TRANSITION_TYPES (transition turlari ro'yxati) va getTransitionLayers() (hamma turlar matematikasi)
    ├── dom.js                  # Barcha DOM element referencelari
    ├── helpers.js               # Umumiy yordamchi funksiyalar (formatTime va h.k.)
    ├── storage.js                # Supabase qatlami (projects jadvali + project-media bucket)
    ├── upload.js                 # Fayl yuklash, drag&drop, Ctrl+V, media yuklash
    ├── playback.js                # Play/Pause, asosiy render loop, o'chirish
    ├── timeline.js                 # Timeline layout, playhead drag & scrub
    ├── zoom.js                      # Zoom (Ctrl +/-/0, Ctrl+g'ildirak, pinch), oddiy g'ildirak = gorizontal scroll
    ├── video-blocks.js             # Video clip bloklarini chizish (filmstrip)
    ├── transition-toast.js         # Cliplar orasidagi transition tugmasi -> pastdan chiqadigan toast (kartalarda jonli preview)
    ├── add-media.js                 # "+" tugma — qo'shimcha video/rasm qo'shish
    ├── music.js                      # Musiqa qo'shish, waveform chizish
    ├── drag.js                        # Clip'larni surish/trim qilish (pointer drag)
    ├── context-menu.js                 # O'ng-klik menyu + split (kesish)
    ├── selection.js                     # Multi-select modeli + marquee (Windows uslubidagi to'rtburchak tanlash)
    ├── music-sync.js                    # Musiqa va video sinxronizatsiyasi
    ├── export.js                         # Canvas + MediaRecorder orqali WebM export
    ├── resize-handle.js                   # Timeline balandligini sudrab o'zgartirish
    └── projects.js                         # Dashboard, autosave, project ochish/yopish
```

## ▶️ Ishga tushirish

Fayl statik bo'lgani uchun hech qanday build kerak emas:

1. `index.html` faylini shunchaki brauzerda oching (double-click yetarli).
2. Yoki lokal serverda: `python3 -m http.server` va `http://localhost:8000` ga o'ting.

> **Eslatma:** Barcha `<script>` va `<link>` fayllar oddiy (module bo'lmagan) tarzda ulangan, shuning uchun `file://` orqali to'g'ridan-to'g'ri ochilganda ham ishlayveradi — CORS muammosi yo'q.

## 🔗 Fayllar orasidagi bog'liqlik

JS fayllar **global scope**'da ishlaydi (ES-module emas), shu sabab `index.html`dagi yuklash tartibi muhim:

```
state → dom → helpers → storage → upload → playback → timeline → zoom → video-blocks
→ add-media → music → drag → context-menu → selection → music-sync → export → resize-handle → projects
```

Har bir keyingi fayl oldingi fayllarda e'lon qilingan `state`, DOM konstantalari va funksiyalardan foydalanadi.

## 🎨 Ranglar (logodan olingan)

| Rol | Rang |
|---|---|
| Ko'k (tanlov, video clip, marquee, export, resize handle, "MR") | `#5d95ad` — `--brand-blue` (logo ko'ki `#467386`, to'q fonda ochroq) |
| Oq (playhead, musiqa waveform, hover matn) | `#f4f7f8` — `--brand-white` |
| Ko'mir fon (logo foni) | `#191d22`, barcha to'q neytral fonlar shu tusda |

O'zgaruvchilar `css/base.css` ning `:root` qismida; canvas uchun nusxasi `js/helpers.js` dagi `BRAND`.

## 🔐 Login (Supabase)

- `login/index.html` (`/login/`) — faqat Google orqali kirish.
- `js/supabase-config.js` — **shu yerga** `url` va `anonKey` qo'yiladi.
- `js/auth.js` — `Auth.signInWithGoogle()`, `Auth.signOut()`, `Auth.requireSession()`.
- `js/vendor/supabase.js` — supabase-js 2.116.0 (UMD, lokal nusxa, CDN kerak emas).
- Kalitlar qo'yilmagan bo'lsa — `index.html` avval login sahifaga otadi; "Continue without account" bosilsa shu tab uchun dev rejim yoqiladi. Kalitlar qo'yilgach faqat haqiqiy sessiya kiritadi.

Supabase dashboard sozlamalari:
1. **Authentication → Providers → Google**: yoqish (Google Cloud'dan Client ID/Secret).
2. **Authentication → URL Configuration**: Site URL: `https://domen`. Redirect URLs ga: `https://domen/` va `https://domen/**` (lokalda `http://localhost:PORT/` va `http://localhost:PORT/**`).

**Vercel:** Environment Variables ga `SUPABASE_URL` va `SUPABASE_PUBLISHABLE_KEY` ni qo'y (Production + Preview). `vercel.json` build vaqtida `scripts/build-config.js` ni ishga tushirib `js/supabase-config.js` ni yozadi. Env o'zgarsa — redeploy kerak. Connection string (`postgresql://...`) va `service_role` key HECH QAYERGA qo'yilmaydi.

`file://` orqali OAuth ishlamaydi va `/login/`, `/terms/`, `/privacy/` papka havolalari ochilmaydi — lokalda `python3 -m http.server` yoki shunga o'xshash server ishlat.

### 🔗 Har bir project'ning URL'i

Project ochilganda manzil `#p/<projectId>` ko'rinishiga o'tadi (masalan
`https://domen/#p/1732000000-ab12cd`) — shu havolani saqlab qo'yib, keyin to'g'ridan-to'g'ri
o'sha project'ga o'tish mumkin. Havola ochilganda ham avval login tekshiruvi ishlaydi
(sessiya bo'lishi kerak), lekin istalgan Google hisobi bilan kirish mumkin — har bir
foydalanuvchi faqat o'ziga (Supabase RLS orqali) tegishli loyihalarni ko'radi. Dashboard'ga
qaytilganda (`←` yoki brauzerning Back tugmasi) havola tozalanadi.

## ✨ Xususiyatlar

- 🔐 **Google login** (Supabase Auth) — har bir foydalanuvchi faqat o'z loyihalarini ko'radi (RLS)
- 🗂️ **Projects dashboard** — loyihalar Supabase'da saqlanadi; boshqa qurilma/brauzerdan kirsangiz ham (shu hisob bilan) loyihalaringiz turadi. Kartani bosib ochasiz, ✎ nom o'zgartirish, × o'chirish. Editorda chap tepadagi ← tugmasi dashboard'ga qaytaradi
- 🔗 Har bir loyiha `#p/<id>` shaklida o'z URL'iga ega (yuqoridagi bo'limga qarang)
- 📤 Video/rasm yuklash (tugma, dashboard'ning ixtiyoriy joyiga drag&drop, Ctrl+V)
- 🔍 Timeline zoom: `Ctrl +` / `Ctrl -` / `Ctrl 0`, `Ctrl + g'ildirak`, trackpad pinch (kursor ostidagi vaqt joyida qoladi). Oddiy g'ildirak — gorizontal scroll (`Alt` + g'ildirak — vertikal)
- ▭ Marquee tanlash: bo'sh joydan sichqonchani bosib tortsangiz, faqat **butunlay ichiga kirgan** bloklar (clip va musiqa) tanlanadi. Tanlanganlardan bittasini ushlab hammasini birga surasiz; `Delete` hammasini o'chiradi. Bo'sh joyga oddiy click — tanlovni bekor qiladi
- 🎞️ Multi-clip timeline, filmstrip preview
- 🎵 Fon musiqasi qo'shish + waveform ko'rinishi
- ✂️ Split (kesish), trim (chetlarini qisqartirish)
- 🖱️ Erkin drag & drop (vertikal va gorizontal). Video kliplar qatorlarga joylashadi; bir qatorda overlap yo‘q, musiqa/matn treki ustiga tushmaydi (desktop/tablet/mobile)
- 📏 Timeline balandligini 1%–100% oralig'ida sudrab o'zgartirish
- 📱 To'liq responsive — mobil, planshet, desktop
- 🎬 WebM formatda video eksport (video + musiqa aralashtirilgan holda)
- 🔀 Cliplar orasida transition: None, Slide left/right/up, Fade, Dip black, Dip white, Zoom, Blur, Wipe left/right. Panelda har bir tur jonli ko'rinadi; davomiylik slayderda. Yangi tur qo'shish: `state.js` dagi `TRANSITION_TYPES` ga 1 qator + `getTransitionLayers()` ga 1 `case` — preview ham, export ham shu funksiyadan oladi

## 🎯 Tavsiya etiladigan keyingi tool'lar

Ilovaning maqsadi — **kundalik hayot uchun**, kam va oddiy tool'lar bilan tez montaj. Hozircha yo'q,
lekin shu maqsad uchun eng ko'p kerak bo'ladigan funksiyalar, muhimlik tartibida:

1. **Ovoz balandligi / Mute** — har bir video clip va musiqa uchun alohida volume slider + mute. Hozir ikkalasi ham doim 100%.
2. **Matn / sarlavha (text overlay)** — sana, ism, qisqa izoh qo'yish uchun bitta oddiy, drag qilinadigan matn bloki.
3. **Undo / Redo (Ctrl+Z / Ctrl+Y)** — hozir xato split/o'chirish/trim'ni orqaga qaytarib bo'lmaydi.
4. **Tezlik (speed)** — 0.5x/1x/1.5x/2x, clip darajasida.
5. **MP4 eksport** — hozir faqat WebM; ba'zi platforma/qurilmalarda muammo qilishi mumkin (masalan ffmpeg.wasm orqali).
6. **Fade in / Fade out** — video va musiqa uchun oddiy checkbox.
7. **Rasm davomiyligini sozlash** — hozir har doim qat'iy 5 soniya.

Bularning hech biri murakkab emas — maqsad "professional editor" emas, balki **kam tugma bilan tez ish bitiradigan** vosita bo'lib qolishi.

## 💾 Saqlash haqida

- Har bir o'zgarish (surish, trim, split, o'chirish, media/musiqa qo'shish) ~0.3s dan keyin avtomatik saqlanadi; dashboard'ga qaytganda va sahifa yopilganda ham.
- Loyiha meta'si (`projects` jadvali) va media fayllar (`project-media` bucket, yo'l: `<user_id>/<projectId>/<fileId>`) Supabase'da saqlanadi. Bitta manba fayl bir necha split clip'ga xizmat qiladi, ikki marta yuklanmaydi.
- Har bir foydalanuvchi faqat **o'z** qatorlari/fayllarini ko'radi va o'zgartira oladi (Row Level Security, `SETUP-SUPABASE.sql`). Loyiha o'chirilganda uning fayllari ham o'chadi.
- Internet aloqasi kerak (Supabase API'ga so'rov) — offline'da yangi saqlash ishlamaydi.
