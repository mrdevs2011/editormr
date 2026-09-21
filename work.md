# EditorMR — "Kundalik montaj" ilovasiga yo'l xaritasi

> Maqsad: telefonda yoki kompyuterda olingan oddiy videoni **link ochilgandan export'gacha 3 daqiqada** montaj qilib beradigan, login/o'rnatish/watermark talab qilmaydigan, o'zbekcha ilova.
>
> Bu hujjat `editormr-production.zip` ichidagi kodni **o'qib** yozildi (7.5K qator JS, 242 fayl). Kodga tegilmagan. Hech narsa ishga tushirib sinalmagan — shuning uchun "🐞 gumon" belgili joylarni avval o'zing reproduce qil, keyin ishon.

---

## 0. Bir sahifada: nima qilamiz va nima uchun shu tartibda

Sen "montaj qilguncha siqilib ketyapman" deding. Kodga qarab sababini topdim:

1. **Export real-time.** 3 daqiqalik video = 3 daqiqa kutish (`captureStream` + `MediaRecorder`), keyin yana WebM → MP4 ffmpeg.wasm (1 thread) navbati. Bu eng katta og'riq.
2. **Preview ≠ export.** Ikki xil kod yo'li: preview `<video>` + CSS, export alohida canvas. Shuning uchun preview'da ko'rgan narsang export'da boshqacha chiqishi mumkin (pastda ro'yxat).
3. **Yopiq oqim.** Google login majburiy, media Supabase'ga yuklanadi. Oddiy 30 soniyalik ish uchun bu — og'ir bojxona.

Tartib (qoidasi: *og'riq → poydevor → tezlik → feature → sayqal*):

| Faza | Nomi | Nima beradi | Hajm |
|---|---|---|---|
| 0 | Bug-bash + poydevor | Ishonch: matn yo'qolmaydi, export to'g'ri | M |
| 1 | Export inqilobi | Kutish yo'qoladi, to'g'ridan-to'g'ri MP4 | XL |
| 2 | Yagona renderer + kanvas | 9:16 / 1:1 / 16:9, fit/fill, overlay transform | XL |
| 3 | Tezlik funksiyalari | Auto-cut jim joy, snap, inspector, hotkey | L |
| 4 | Audio | Ko'p qatlam, voice-over, ducking, waveform | L |
| 5 | Matn va subtitr | Shrift, animatsiya, SRT, auto-caption | XL |
| 6 | Vizual effektlar | Filter, crop/rotate, Ken Burns, sticker | L |
| 7 | Local-first + guest | Login'siz ishlaydi, media qurilmada | XL |
| 8 | Mobil / PWA / share | Telegram'ga bir tugmada | L |
| 9 | Sayqal + launch | i18n, onboarding, test, analytics | L |

Hajm (full-focus kunlarda): **S** ≤1 kun · **M** 2–4 kun · **L** 1–2 hafta · **XL** 2–4 hafta. Part-time bo'lsang ×2. Halol jami: **taxminan 4–6 oy**. Bu marafon, sprint emas.

**Uchta qonun** (buzsang roadmap qulaydi):

1. **Yangi feature'dan oldin Faza 0 va 1.** Buzuq poydevorga tugma qo'shish = qumga uy qurish.
2. **Qayta yozma (rewrite), bittalab almashtir.** Eski fayl yonida yangisini qur, parity bo'lgach eskisini o'chir (strangler pattern). 7.5K qatorni "toza" qilaman deb 2 oy yo'qotish — klassik tuzoq.
3. **Har faza = deploy + benchmark.** Faza oxirida pastdagi "K-1" testni yugurt, natijani yoz. O'lchanmagan narsa yaxshilanmagan.

---

## 1. Audit: hozirgi holat (kod bo'yicha)

### 1.1 Nima bor ✅ (bunga tegma, ustiga qur)

- Ko'p qatorli video timeline (32 gacha), float overlay, marquee/multi-select, copy/paste/duplicate, ripple, undo/redo (30 qadam).
- Trim, split (`S`), speed 0.5–2×, volume/mute, fade in/out (video + musiqa).
- 11 ta transition (fade, slide×3, dip×2, zoom, blur, wipe×2) — preview'da ham, export'da ham (`updatePreviewTransition`, `drawExportTransition`, matematika bitta `getTransitionLayers`).
- Matn overlay (inline tahrir, drag, resize, rang, bold, fon).
- Musiqa (waveform, trim, fade, volume), rasm clip (1–10 s).
- Dashboard, loyihalar, autosave, optimistic lock (ko'p qurilma), Supabase RLS to'g'ri yozilgan.
- Klaviatura: Space, S, Delete, ←/→, Ctrl+Z/Y/C/V/D, zoom. Mobil action bar, tablet CSS. Help sahifa skrinshotlar bilan. Terms/Privacy bor.
- Xavfsizlik boshlanishi: CSP, COOP/COEP, `service_role` key brauzerga chiqmasligi tekshiruvi (`build-config.js`).

### 1.2 🐞 Bug va nomuvofiqliklar (ustuvorlik bo'yicha)

Belgilar: **[aniq]** = kodni grep qilib tasdiqladim; **[gumon]** = kod shunday ko'rinadi, sinab ko'rmadim.

| # | Muammo | Joyi | Ishonch |
|---|---|---|---|
| B1 | **Matn overlay'lar saqlanmaydi.** `saveProjectNow` meta'ga `textClips` qo'shadi, `openProject` uni o'qiydi, lekin `dbSaveProject` va `rowToMeta` unga tegmaydi, SQL'da ustun ham yo'q. Sahifani yangilasang matn yo'qoladi. | `projects.js:230, :657`, `storage.js`, `SETUP-SUPABASE.sql` | **aniq** |
| B2 | **Export `state.isImage`ga bog'liq** — bu "oxirgi preview qilingan clip" degani, loyiha holati emas. Asosiy qatordagi rasm clip export'da qora chiqishi (`// photo clip — skip`), yoki `isImage=true` bo'lsa hamma clip bitta rasm bo'lib chizilishi, video audiosi tushib qolishi mumkin. | `export.js:32, 75, 168, 342–351` | gumon |
| ~~B3~~ | ~~Video export'da cho'ziladi.~~ **RAD ETILDI (bug emas) — 2026-09-20 tekshiruvida.** `js/canvas.js` (`getCanvasOutputSize`, `canvasDrawContain`) allaqachon canvas-nisbat presetlari va "contain" chizishni amalga oshirgan; `export.js` shu funksiyalardan foydalanadi, to'g'ridan-to'g'ri cho'zish topilmadi. Batafsil: `REPRODUCE.md`. | `js/canvas.js`, `export.js:93,361,393,398` | ❌ rad etildi |
| B4 | **Matn o'lchami preview va export'da har xil.** Preview `fontSize` ni CSS `px`da, export `ctx.font`ni chiqish piksellarida chizadi; export shrifti `sans-serif`. Nisbiy o'lcham yo'q. | `text-overlay.js:499–510, 629–665` | gumon |
| B5 | **Float overlay: preview ≠ export.** Preview faqat *oxirgi* float'ni ko'rsatadi (+ 86% max, ramka, soya); export hammasini 7% padding bilan cho'zib chizadi, ramka/soya yo'q. Float'ning joyi/o'lchamini o'zgartirib bo'lmaydi. Float audiosi export'da yo'q. | `helpers.js:316–372`, `export.js:392–420`, `preview.css:82–98` | gumon |
| B6 | **Sinmaydigan xato o'rniga soxta 5 soniyalik clip.** `getVideoDuration` 4 s'da 5 s qaytaradi; `onerror`da ham 5 s clip yaratiladi. HEVC/MKV/buzuq fayl = jim, bo'sh clip, xabar yo'q. Katta faylning metadata'si 4 s'dan sekin kelsa noto'g'ri davomiylik. | `upload.js:190–203, 87–97` | **aniq** |
| B7 | Export real-time va `requestAnimationFrame`ga bog'liq: tab fon rejimiga o'tsa kadrlar to'xtaydi/buziladi. `beforeunload`, Wake Lock, bekor qilish yo'q. | `export.js:22–520` | gumon |
| B8 | A/V sinxron: `currentTime` drift tuzatish (0.12 s chegara) — sakrash/eshitiladigan uzilish. | `export.js:87–102` | gumon |
| B9 | Dashboard'ga tashlashda faqat `files[0]` olinadi. | `upload.js` drop handler | **aniq** |
| B10 | `loadMusicFromFile` har safar yangi `AudioContext` ochadi va yopmaydi (leak); butun audio fayl `AudioBuffer`ga dekod qilinadi (uzun trek = RAM). | `music.js:36–60` | **aniq** |
| B11 | Kod gigiyenasi: `trackObjectUrl(trackObjectUrl(...))` ichma-ich ternary (avto-patch izi); clip literal 3 joyda nusxa; `clipsTimeOverlap` 2 joyda e'lon qilingan. | `upload.js:44`, `state.js:89` + `drag.js:6` | **aniq** |
| B12 | Oxirgi clipni o'chirib bo'lmaydi ("Kamida 1 ta clip qolishi kerak") — bo'sh timeline holati yo'q. | `playback.js` `deleteSelectedClip` | **aniq** |
| B13 | Til aralash: `'Music added'`, `'Failed to load music'`, `'Please select a video…'` vs `'Clip o\'chirildi'`. Tooltiplar inglizcha. | `music.js`, `upload.js`, `index.html` | **aniq** |
| B14 | Help sahifa eskirgan: "Preview'da transition ko'rinmaydi" — holbuki `updatePreviewTransition` bor. Kommentlarda "IndexedDB" deyilgan, kod Supabase'ga yozadi. | `help/index.html`, `projects.js:2` | **aniq** |
| B15 | `index.html` har kirishda `ffmpeg.js` va `@ffmpeg/util`ni CDN'dan yuklaydi (export qilmasang ham). | `index.html` | **aniq** |
| B16 | **(2026-09-21 topildi, B1-B15 ro'yxatida yo'q edi)** `mobile-toolbar.js`da qavs xato joylashgan (`if/else if` zanjiri buzilgan) — bu **parse-vaqtidagi SyntaxError**, ya'ni butun fayl umuman ishga tushmay qolardi: mobilda undo/redo/copy/paste/split/float/dup/delete — hech biri ishlamasdi. Haqiqiy Chromium'da (Playwright, `tests/verify-b15-ffmpeg-lazyload.mjs` yozish jarayonida, tasodifan) topildi — kodni o'qishda ko'rinmagan, faqat brauzerda `pageerror` sifatida chiqadi. **Tuzatildi.** | `mobile-toolbar.js:89-99` | **aniq (tuzatildi)** |

### 1.3 ⚠️ Arxitektura xavflari

| # | Xavf | Nega muhim |
|---|---|---|
| A1 | **Export = ekran yozish.** Real-time, 1280px cap, 30 fps, 4 Mbps qattiq yozilgan, faqat WebM; MP4 uchun 2-bosqich ffmpeg.wasm (`@ffmpeg/core` single-thread). | Foydalanuvchi eng ko'p kutadigan joy. |
| A2 | **Ikki renderer** (preview: 3 ta `<video>` + CSS; export: canvas). Har effekt ikki marta yoziladi. | Har yangi feature = ikki baravar bug. |
| A3 | **Global skriptlar tartibi** (`index.html`da 22 ta `<script>`, hammasi global, ES module yo'q, test yo'q). | Refaktor qo'rqinchli; pure mantiq testsiz. |
| A4 | `state.videoFile/videoUrl/videoDuration/isImage` = "joriy preview clip" global holati (`ensurePreviewForClip` ularni qayta yozadi). | B2 ning ildizi. |
| A5 | **Sxema versiyasi yo'q.** Clip maydonlari `saveProjectNow`da qo'lda sanab yozilgan (whitelist) + `openProject`da tiklanadi. Yangi maydon qo'shsang, birini unutasan (B1 shundan). | Faza 2–6 da har feature yangi maydon. |
| A6 | **Autosave 300 ms.** Har saqlashda: lock o'qish + `updated_at` peek + update + heartbeat (o'qish+yozish) = 4–6 so'rov. Thumbnail base64 DB qatorida. Dashboard `select('*')` hamma loyihaning clips+thumbini tortadi. Lock `file_names` jsonb ichiga yashiringan (hack). | Loyiha ko'paygan sari sekinlashadi. |
| A7 | **Media bulutga yuklanadi va har ochishda to'liq `Blob` qilib yuklab olinadi** (`dbGetFiles`). Resumable emas, progress yo'q. Supabase bepul tarifida fayl hajmi/umumiy hajm cheklovi bor (hozirgi qiymatni dashboard'dan tekshir). | 300 MB video = og'ir; 1 GB limit tez to'ladi. |
| A8 | **Faqat 1 musiqa** (`state.music` yagona obyekt). Yangisi eskisini almashtiradi. | SFX / voice-over / qatlamli audio yo'q. |
| A9 | `Permissions-Policy: microphone=()` — voice-over uchun blok. CSP `script-src` faqat `self` + jsdelivr. | Faza 4 dan oldin o'zgartirish kerak; kutubxonalarni `js/vendor/`ga qo'yish. |
| A10 | Mehmon rejimi yo'q (`requireSession` faqat localhost'da bypass). | "Link ochdi → montaj qildi" ssenariysi yo'q. |

### 1.4 ❌ Yo'q funksiyalar (kundalik montaj nuqtai nazaridan)

Kanvas nisbati (9:16/1:1/4:5), fit/fill/blur-fon · crop/rotate/flip · filter/rang tuzatish · opacity slider · overlay joyi/o'lchami/aylanishi · Ken Burns · freeze frame · reverse · ko'p audio qatlam · voice-over · ducking · ovoz 100%dan baland · shrift tanlash · matn stroke/soya/animatsiya · subtitr/SRT/auto-caption · sticker/emoji · export sifat presetlari (720/1080, fps) · auto-cut jim joylar · clip chetlarini snap qilish · I/O belgilar, marker, J/K/L · inspector panel (hozir sozlamalar o'ng-klik menyuda) · ko'p fayl import · PWA/offline · Web Share.

---

## 2. Mental model: "Bitta retsept, ikki likopcha"

Bu butun roadmap'ning yuragi. Buni tushunsang, Faza 1 va 2 o'zi ochiladi.

**Hozir — ekran yozish:**

```
                 ┌─► <video> A/B/float + CSS ──────────► PREVIEW   (1-yo'l)
   state ────────┤
                 └─► alohida canvas + yangi <video>lar
                     + performance.now() soati
                     + MediaRecorder "yozib oladi" ─────► EXPORT    (2-yo'l)
```

Analogiya: kino'ni proyektorda qayta o'ynatib, telefon bilan suratga olyapsan. 3 daqiqalik kino = 3 daqiqa. Yorug'lik tushsa (tab fonga o'tsa) — kadr buziladi.

**Kerak — kadrma-kadr pishirish:**

```
                              ┌─► PREVIEW: har rAF'da render(t = playhead)
   state ──► render(t) ──► canvas
                              └─► EXPORT:  for i in 0..N: render(t = i / fps) → encoder
```

Analogiya: oshxona. **Retsept bitta** (`render(t)` — "t vaqtida ekranda nima ko'rinadi"), **likopcha ikkita**: mijozga ko'rsatish (preview) va olib ketishga qadoqlash (export). Preview'da ko'rgan taom qadoqdagi taom bilan aynan bir xil, chunki retsept bir.

Eng muhim g'oya — **vaqt soat emas, o'zgaruvchi**. Export'da `t` devor soatidan olinmaydi, `i / fps` formulasidan olinadi. 60 soniyalik video = 1800 ta `render()` chaqiruvi; qancha vaqt olishi *CPU/GPU tezligiga* bog'liq, video uzunligiga emas. Shu tufayli:

- export real-time'dan tez bo'ladi (yaxshi qurilmada bir necha baravar);
- tab fonga o'tsa ham mantiq buzilmaydi (faqat sekinlashadi);
- A/V sinxron muammosi yo'qoladi (kadr vaqti ham, audio vaqti ham `t`dan hisoblanadi).

**Frame source** (kadr manbai) — `render(t)`ga "clip X ning manba vaqti `s`dagi kadri" kerak. Shuning uchun bitta interfeys:

```
FrameProvider.getFrame(clip, sourceTime) → ImageBitmap | VideoFrame
   ├─ PreviewProvider : <video> element, seek/play (jonli, tez seek)
   └─ ExportProvider  : WebCodecs VideoDecoder, ketma-ket dekod (tez, aniq)
```

`render()` manbaning qayerdan kelishini bilmaydi. Mana shu ajratish A2 va B2–B5 ni ildizidan yo'q qiladi.

**Layer modeli** (har kadrda pastdan yuqoriga chiziladi):

```
1. fon (qora / blur-fon)
2. asosiy qator clip(lar)  (+ transition: ikki qatlam aralashadi)
3. float qatorlar 1..N     (har birining transform + opacity)
4. sticker/rasm overlay
5. matn/subtitr
```

Har layer = `{ source, transform{x,y,scale,rot}, opacity, fit, fx[] }`. Transition, fade, Ken Burns — hammasi shu maydonlarni `t` bo'yicha o'zgartiradi. Shu sababli "keyframe tizimi" yozmasdan ham ko'p narsa (Ken Burns, slide, zoom) bir xil mexanizmda ishlaydi.

---

## 3. Boshlash uchun o'lchov: "K-1" kundalik test

Har faza oxirida shuni bajar va jadvalga yoz (`BENCHMARKS.md`).

**K-1 ssenariysi:** 3 ta telefon videosi (jami ~90 s, 1080×1920, biri HEVC .mov), 12 ta kesish, 2 ta transition, 1 ta musiqa (fade), 2 ta matn, natija 9:16 1080p MP4.

| Ko'rsatkich | Hozir (taxmin, o'lchab yoz) | Faza 1 maqsadi | Yakuniy maqsad |
|---|---|---|---|
| Fayl tashlash → birinchi kadr | ? | — | < 2 s |
| Timeline'da scrub/play lag | ? | — | 60 fps'ga yaqin, sezilarli lag yo'q |
| Export vaqti (desktop) | ≈ video uzunligi (90 s+) | ≤ 0.5× | ≤ 0.3× |
| Export vaqti (o'rta Android) | ? | ≤ 1.5× | ≤ 1× |
| A/V sinxron xatosi | ? | ≤ 80 ms | ≤ 40 ms |
| Ochilish → export tayyor (foydalanuvchi ish vaqti) | ? | — | **≤ 3 daqiqa** |
| Crash / buzuq chiqish | ? | 0 | 0 |

**Sinov fayllari to'plami** (bir marta yig', hamma fazada ishlat): H.264 mp4 · iPhone HEVC .mov · o'zgaruvchan kadr tezligi (VFR) ekran yozuvi · vertikal (rotation metadata) · 4K60 · WebM · MKV · audiosiz video · 20 daqiqalik uzun · HEIC/JPEG rasm · iPhone HDR (HLG) video.

**Brauzer matritsasi:** Chrome desktop · Edge · Firefox · Safari macOS · Chrome Android (o'rta qurilma) · Safari iOS. Har fazada kamida Chrome desktop + Chrome Android + Safari iOS.

---

## 4. FAZALAR

> Har faza: **Maqsad → Vazifalar → Texnik yo'l → Tayyor deb hisoblash sharti (DoD) → Tuzoqlar.**
> Checkbox'larni o'zing belgilab bor.

---

### FAZA 0 — Bug-bash va poydevor  · hajm: M

**Maqsad:** ishonchni qaytarish. Foydalanuvchi (ya'ni sen) bir marta yo'qotgan matn yoki buzuq export'dan keyin ilovaga ishonmaydi.

**Tartib muhim: avval reproduce, keyin tuzat.** Yuqoridagi [gumon] belgili 8 ta narsaning ba'zisi aslida bug bo'lmasligi mumkin.

- [x] **Reproduce jadvali** yarat: B1–B15 uchun "qadamlar → kutilgan → haqiqiy". (Bu seansda brauzer yo'q edi — skrinrekord qilinmadi, kod o'qib tasdiqlandi. Natija: `REPRODUCE.md`.)
- [x] **B1** matn saqlanmasligi: `migrations/001_add_text_clips.sql` (yangi fayl — Supabase SQL Editor'da **hali qo'llanmagan**, qo'lda ishga tushirish kerak), `dbSaveProject` (`storage.js:198` — `text_clips: meta.textClips || []`) va `rowToMeta` (`storage.js:86-87` — `textClips: Array.isArray(row.text_clips) ? row.text_clips : []`) ulandi. `projects.js` allaqachon `meta.textClips`ni to'g'ri tayyorlab yuborar edi (o'zgartirilmadi). Sof mantiq testi (`node`) yashil. **Brauzerda sinalmadi** — migratsiya qo'lda ishga tushirilgach, "matn qo'sh → yangila → ochil" qadamini o'zing bir marta bajarib tasdiqla.
- [ ] **B2/B3/B4/B5** uchun **regressiya fixturalari**: kichik 5 ta loyiha (rasm bilan, aralash orientatsiya, matn bilan, float bilan, transition bilan). Hozirgi export natijasini skrinshot qilib saqla ("oltin namuna" emas — "hozirgi noto'g'ri holat" sifatida). Faza 1–2 tugaganda bularning hammasi to'g'ri chiqishi kerak.
- [x] **B6** yaroqsiz fayl: `js/upload.js:getVideoDuration()` endi xato/timeout'da **reject** qiladi (avval jim `resolve(5)`), timeout 4s → 15s. Chaqiruvchilar (`addMediaToTimeline`, `loadMediaAsMain`ning `previewVideo.onerror`) `try/catch` bilan ushlab, `showToast('Bu formatni brauzer o\'qiy olmadi (HEVC?). MP4 (H.264) ga aylantirib ko\'ring')` ko'rsatadi va **clip yaratmaydi** (`loadMediaAsMain`da endi `switchToEditor()` ham chaqirilmaydi — foydalanuvchi upload ekranida qoladi). `node --check js/upload.js` — OK. **Brauzerda sinalmadi** — buzuq/HEVC fayl bilan haqiqiy urinish kerak.
- [x] **B9** ko'p fayl tashlash → ketma-ket clip sifatida qo'shish. `js/upload.js`: yangi `handleFiles(fileList)` (video/rasm bo'lmaganlarini filtrlaydi, birinchisini `handleFile` bilan kutib, qolganlarini `addMediaToTimeline` bilan ketma-ket qo'shadi); `handleFile`/`loadMediaAsMain` endi Promise qaytaradi (kutish uchun kerak edi — eski chaqiruvchilar buzilmadi, chunki hech kim qaytgan qiymatga tayanmagan edi). `uploadScreen` drop va `#file-input` change endi `handleFiles(...)` chaqiradi; `index.html`da `#file-input`ga `multiple` qo'shildi.
- [x] **B10** `AudioContext`ni bitta umumiy qilish yoki `close()`; waveform uchun butun `AudioBuffer` o'rniga **peaks massivi** (Faza 4 da chuqurlashadi). `js/music.js:loadMusicFromFile` — `decodeAudioData`dan keyin (muvaffaqiyatli yoki xato, `try/finally`) `audioCtx.close()` chaqiriladi. Butun faylni `AudioBuffer`ga dekod qilish hali ham shu yerda qoladi — **peaks massiviga o'tish qasddan qilinmadi**, chunki bu Faza 4'ning o'z bandi (waveform arxitekturasi shu yerda qayta yozilsa, ikki marta ishlashga to'g'ri keladi).
- [x] **B11** `createClip()` fabrikasi (clip maydonlari bitta joyda); `clipsTimeOverlap` dublikatini olib tashlash. `js/state.js`ga `createClip(overrides)` qo'shildi (`makeClipId()` yonida); `js/upload.js`dagi 4 ta deyarli bir xil clip-literal (`loadMediaAsMain` ichida 3 ta + `addMediaToTimeline`dagi 1 ta) shu fabrikaga o'tkazildi; `trackObjectUrl(trackObjectUrl(...))` ichma-ich ternary bitta chaqiruvga soddalashtirildi; `drag.js`dagi `clipsTimeOverlap` dublikati olib tashlandi (`state.js`dagisi qoladi).
- [ ] **B12** bo'sh timeline holatini qo'llash yoki "oxirgi clip"ni o'chirishga ruxsat + bo'sh holat UI. **BACKLOG (2026-09-20):** `state.videoClips[0]`ga 11 fayl / 19+ joyda tayanilgan — kichik yamoq emas, haqiqiy fix FAZA 2 (`render(t)` yagona renderer)da tabiiy chiqadi. Hozir tegilmadi (foydalanuvchi bilan aniqlashtirilmadi — "loyihani o'chirish" kabi halokatli yon ta'sirlarsiz hal qilib bo'lmaydi).
- [ ] **B13/B14** matnlarni tozalash (hozircha faqat ro'yxat: to'liq i18n Faza 9 da), help'dagi eskirgan jumla. **[x] Bu seansda topilgan aniq joylar tuzatildi** (`music.js`: 2 ta ingliz toast; `upload.js`: 2 ta ingliz toast; `help/index.html`: transition + IndexedDB jumlalari; `projects.js` izohi). To'liq i18n tizimi (barcha matnni bitta joyga chiqarish) hali Faza 9'da. **Qo'shimcha topilma va tuzatish (keyingi seans):** `js/state.js:37` izohi va `privacy/index.html` (haqiqiy foydalanuvchiga ko'rinadigan maxfiylik sahifasi!) hali "IndexedDB"/"faqat brauzeringizda saqlanadi, serverga yuklanmaydi" deb yozgan edi — bu noto'g'ri (kod Supabase Storage'ga yuklaydi). Ikkalasi ham Supabase'ni to'g'ri tasvirlaydigan holga keltirildi.
- [x] **B15** ffmpeg skriptini faqat kerak bo'lganda dinamik yuklash (`import()` / `<script>` inject). `index.html`dagi 2 ta statik `<script src=".../ffmpeg...">` olib tashlandi; `js/export.js:getFFmpeg()` ichida `loadFFmpegScripts()` — birinchi export (MP4) chaqirilganda `document.createElement('script')` bilan inject qiladi, parallel chaqiruvlarda ham bitta marta (keshlangan promise).
- [x] **Sxema versiyasi:** `js/projects.js` boshiga `PROJECT_SCHEMA_VERSION = 1` va `migrateProjectMeta(meta)` (hozircha v0→v1 faqat versiyani belgilaydi, struktura o'zgarmadi) qo'shildi. `saveProjectNow`dagi `meta` obyektiga `schemaVersion: PROJECT_SCHEMA_VERSION` qo'shildi; `openProject`da `dbGetProject`dan kelgan `meta` `migrateProjectMeta()` orqali o'tkaziladi. **Cheklov (ochiq aytilyapti):** Supabase'dagi `projects` jadvalida `schema_version` ustuni yo'q (SQL migratsiyasiga tegilmadi — vazifada so'ralmagan edi), `dbSaveProject`/`rowToMeta` bu maydonni DB'ga yozmaydi/o'qimaydi. Demak `schemaVersion` hozircha faqat runtime'da (har `openProject`da `migrateProjectMeta` orqali) hisoblanadi, DB'da saqlanmaydi — kelajakda haqiqiy migratsiya kerak bo'lsa, alohida `migrations/00N_schema_version.sql` + `storage.js` o'zgarishi zarur. `node --check js/projects.js` — OK.
- [x] **Sof mantiqqa test:** `tests/logic.test.mjs` — Vitest emas, oddiy Node (`node:assert/strict` + `node:vm`), npm install SHART EMAS. `js/state.js` + `js/drag.js` manbasini `vm.runInContext`ga yuklab, `clipDuration`, `timelineToSource`/`sourceToTimeline` (round-trip), `resolveVideoStartTimeOnTrack`, `getTransitionMaxDuration` uchun 13 ta test. Yugurtirish: `node tests/logic.test.mjs` — **13/13 OK** (shu muhitda ishga tushirilgan, natija haqiqiy, gumon emas). `getTransitionLayers` testlanmadi (vazifada so'ralmagan, murakkabroq — canvas-bog'liq matematik funksiya, keyingi safar qo'shsa bo'ladi).
- [x] **Global xato ushlovchi:** `index.html`ga (eng birinchi `<script>`lardan biri, boshqa fayllardan OLDIN) `window.addEventListener('error', ...)` + `window.addEventListener('unhandledrejection', ...)` qo'shildi — konsolga struktura bilan yozadi (`kind`, `message`, `stack`), `showToast` mavjud bo'lsa (hali yuklanmagan bo'lishi mumkin) toast ham ko'rsatadi. Faza 9'dagi "yuborish"ga ulash hali qilinmagan (hozircha faqat konsol+toast). **Brauzerda sinalmadi** — qasddan xato tashlab (masalan konsolda `throw new Error('test')`) tekshirish kerak.
- [x] **Export'dan himoya:** `js/export.js`dagi `exportBtn` handlerga `beforeunload` guard (`e.preventDefault(); e.returnValue=''`) export boshlanganda qo'shiladi/tugagach olib tashlanadi; `navigator.wakeLock.request('screen')` mavjud bo'lsa export paytida so'raladi, `finally`da `release()` qilinadi (qo'llab-quvvatlanmasa yoki ruxsat berilmasa — jim davom etadi, xato bermaydi). `node --check js/export.js` — OK. **Brauzerda sinalmadi** — export boshlab, tabni yopishga urinib ogohlantirish chiqishini va ekran o'chmasligini tekshirish kerak (Wake Lock faqat HTTPS/localhost'da ishlaydi — browser talab).

**Texnik yo'l:** Vite'ni hozir *kiritma*. Faza 0 da faqat: testlar + `createClip` + `serializeProject`. Modulga o'tish Faza 2 boshida, `render/` papkasi bilan boshlanadi.

**DoD:** matn reload'dan omon qoladi · yaroqsiz fayl aniq xato beradi · 5 ta fixture loyiha bor · sof mantiq testlari yashil · `schemaVersion` yozilyapti.

**Tuzoq:** "Shu bilan birga hamma narsani chiroyli qilib qo'yaman." Yo'q. Faqat ro'yxat.

---

### FAZA 1 — Export inqilobi  · hajm: XL

**Maqsad:** export kutish og'rig'ini yo'qotish; to'g'ridan-to'g'ri MP4; sifat tanlash.

**Nega bu 2-o'rinda, 1-da emas:** Faza 0 fixturalarisiz yangi export to'g'ri-noto'g'riligini o'lchay olmaysan.

#### 1A — Tez g'alaba (1–3 kun) · sinov: "MP4 bevosita"

- [ ] `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a')` tekshir. Qo'llab-quvvatlansa (yangi Chrome/Edge, Safari) — **WebM → ffmpeg bosqichini butunlay o'tkazib yubor**, natija bevosita `.mp4`. Qo'llab-quvvatlamasa — hozirgi yo'l. (Brauzer versiyalarini caniuse'da tasdiqla; mobil Safari xatti-harakati alohida.)
- [ ] Export modalida: **bekor qilish** tugmasi, progress + taxminiy qolgan vaqt, "tabni yopma / ekranni o'chirma" banner.
- [ ] Chiqish o'lchami: loyiha sozlamasi (hozircha 720p / 1080p tanlovi), 1280 cap'ni tanlovga aylantir. Bitrate presetlari: *Telegram (kichik)*, *Yaxshi*, *Yuqori*.
- [ ] WebM'da davomiylik metadata'si yo'qligi (ba'zi pleyerda seek qilinmaydi) — 1A dan keyin faqat fallback yo'lda qoladi, shuning uchun bu yerda vaqt sarflama.

#### 1B — Haqiqiy tuzatish: offline render (2–3 hafta)

Bu "Bitta retsept" modelining export yarmi.

- [ ] **`Exporter`** moduli, eski export'ga tegmasdan, "Tez export (beta)" tugmasi ortida.
- [ ] **Video kodlash:** `VideoEncoder` (WebCodecs, H.264 / `avc1`), kadr sikli `t = i / fps`.
- [ ] **Audio:** `OfflineAudioContext` bilan butun miksni (video ovozi, musiqa, fade, volume, mute, speed) oldindan render qilish → `AudioEncoder` (AAC, bo'lmasa Opus).
- [ ] **MP4 muxer:** kutubxona tanlash — `mp4-muxer` yoki uning vorisi `Mediabunny` (tanlashdan oldin GitHub'da holatini tekshir). `js/vendor/`ga qo'yish (CSP `script-src 'self'`).
- [ ] **Kadr manbai:** ikki variant, ikkalasini sinab, o'lchov bilan tanla:
  - **(a)** oddiy: `<video>` seek → `seeked` → `drawImage` (sekinroq, lekin oson, barcha brauzerda ishlaydi);
  - **(b)** tez: WebCodecs `VideoDecoder` + demuxer (Mediabunny kabi) — ketma-ket dekod, tez va aniq.
  Tavsiya: **(a) bilan ishlaydigan versiya → keyin (b)ga o'tkaz.** Birinchi navbatda ishlasin, keyin tez bo'lsin.
- [ ] **Renderer'ni ishlatish:** hozircha Faza 2 gacha eski chizish mantig'ini `render(t)` ichiga ko'chirib qo'y (funksiya sifatida ajratib) — bu Faza 2 uchun ko'prik.
- [ ] **Speed:** manba kadrlarini `sourceTime = trimStart + (t - startTime) * speed` bilan tanla (mavjud `timelineToSource`). Audio uchun pitch masalasiga qarang (Faza 4 tuzog'i).
- [ ] **Aniqlik testlari:** har fixture uchun eski va yangi export'ni yonma-yon ko'r; A/V sinxron (chapak tovushli test video: ovoz va kadr bir zumda).
- [ ] **Fallback zanjiri:** WebCodecs yo'q → 1A yo'li → eski WebM+ffmpeg. Ishlatilgan yo'lni konsolga va (keyin) analytics'ga yoz.
- [ ] **Mobil xotira:** 1080p kadr sikli xotirani to'ldirmasligi uchun `VideoFrame.close()` ni doim chaqir; backpressure (`encoder.encodeQueueSize` ni kuzat).
- [ ] Beta muvaffaqiyatli bo'lgach: standart qil, eski yo'lni "Muammo bo'lsa: eski export" ostiga yashir.

**Tuzoqlar (haqiqatan uradigan joylar):**

- **VFR (o'zgaruvchan kadr tezligi)** — telefon va ekran yozuvlarida ko'p. Kadr sonini emas, vaqt tamg'alarini (timestamp) ishlat.
- **Rotation metadata** — vertikal telefon videosi. Dekoderdan chiqqan kadr to'g'ri burilganini fixture bilan tekshir.
- **iPhone HDR (HLG)** — SDR canvas'da "oqarib" ko'rinadi. Hozircha ma'lum cheklov sifatida hujjatlashtir, tone-map keyinroq.
- **B-kadrlar / GOP:** keyframe oralig'i (masalan 2 s) — Instagram/Telegram uchun yaxshi.
- **Audio pitch:** `OfflineAudioContext`da `playbackRate` ovoz balandligini ham o'zgartiradi (chipmunk). `<video>`da `preservesPitch` bor, offline miksda yo'q. Vaqtincha: 0.5–2× uchun ogohlantirish yoki time-stretch WASM (SoundTouch kabi) — Faza 4 da hal bo'ladi, hozir xatoni bilib qo'y.
- **ffmpeg.wasm lisenziyasi:** standart core'da `libx264` (GPL) bor. WebCodecs yo'liga o'tish shu yerdan ham qutqaradi. Tijoriy yo'nalsang — yuridik maslahat ol.
- **H.264 qo'llab-quvvatlashi:** kodlagich mavjudligini `VideoEncoder.isConfigSupported()` bilan tekshir, yo'q bo'lsa VP9/AV1 emas — fallback yo'lga o't.

**DoD:** K-1 da export ≤ 0.5× real-time (desktop), to'g'ridan-to'g'ri `.mp4`, tab fonga o'tsa buzilmaydi, bekor qilish ishlaydi, 5 fixture to'g'ri.

---

### FAZA 2 — Yagona renderer va kanvas  · hajm: XL

**Maqsad:** preview = export (aynan), va loyihaning **o'z kanvas nisbati** bo'lsin. Kundalik montajning 80%i vertikal (9:16) — shuni birinchi darajali qil.

**2A — Kanvas va fit rejimlari (birinchi, chunki foydalanuvchi darhol sezadi)**

- [ ] Loyiha maydoni: `canvas: { w, h }` (yangi loyiha dialogida: *9:16 (Reels/TikTok/Shorts)*, *1:1*, *4:5*, *16:9*, *Asl nisbat*). Export o'lchami shundan, "birinchi clip"dan emas (B3 yopiladi).
- [ ] Har clip uchun **fit**: `contain` (chetlari qora), `cover` (kesib to'ldirish), **`blur`** (orqada xira nusxa, ustida contain — kundalik montajda eng ko'p ishlatiladigan). Default: yangi loyihada `cover`, gorizontal video vertikal kanvasda `blur`.
- [ ] Qo'lda **pan/zoom** (clip ichida siljitish/kattalashtirish): preview ustida qo'l bilan sudrash + inspector'da raqam.
- [ ] **Xavfsiz zona** ko'rsatkichi (toggle): Reels/TikTok interfeysi yopadigan yuqori/quyi chegaralar. Matn shu zonaga tushmasin.

**2B — `render(t)` compositor**

- [ ] `render/` papkasi va **ES module**ga birinchi o'tish: yangi kodni `<script type="module">` bilan yoz, eski global fayllar yonida ishlayversin (`window.EMR = {...}` ko'prik).
- [ ] `compositor.renderFrame(ctx, project, t, frameProvider)` — yuqoridagi layer modeli. Mavjud transition matematikasini (`getTransitionLayers`) o'zgartirmay chaqir.
- [ ] **Preview'ni compositor'ga o'tkaz:** `<video>`lar endi *ko'rinmaydigan manba*, ko'rinadigan narsa bitta `<canvas>`. (Shu bilan `preview-layer-a/b/float`, CSS transform, `updatePreviewTransition/Float` ning ko'p qismi yo'qoladi.)
- [ ] Preview kadr tezligi: `requestVideoFrameCallback` bilan yangi kadr kelganda chiz, bo'lmasa rAF.
- [ ] **Export = xuddi shu `renderFrame`** (Faza 1B kadr sikli). B2, B3, B4, B5 shu yerda yo'qoladi — fixturalar bilan tasdiqla.
- [ ] **Faza 0 dagi 5 fixture** endi yashil bo'lishi shart.

**2C — Overlay transform (float qatorni haqiqiy qilish)**

- [ ] Har clip: `transform: { x, y, scale, rotation }`, `opacity`. Float clip ustida sichqoncha/barmoq bilan siljitish, burchakdan o'lcham, aylantirish (matn overlay'da shunga o'xshash tutqichlar allaqachon bor — `toi-handle` mantig'ini qayta ishlat).
- [ ] Bir vaqtda **hamma** float qatorlar ko'rinadi (B5), pastdan yuqoriga tartib.
- [ ] Float audiosi (ixtiyoriy: "ovozini ham qo'sh" tugmasi).
- [ ] Rasm clip: **Ken Burns** preset (boshlang'ich/oxirgi transform orasida sekin interpolyatsiya). Rasm slayd-shou = kundalik montajning katta qismi; to'liq keyframe tizimisiz ham ishlaydi.

**Sxema (v2 taklifi, ehtiyot uchun):**

```jsonc
{
  "schemaVersion": 2,
  "canvas": { "w": 1080, "h": 1920, "fps": 30 },
  "clips": [{
    "id": "c1", "fileId": "f1", "track": 0,
    "startTime": 0, "trimStart": 0, "trimEnd": 12.4, "speed": 1,
    "volume": 1, "muted": false, "fadeIn": 0, "fadeOut": 0,
    "fit": "blur",
    "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0 },
    "opacity": 1,
    "transition": { "type": "fade", "duration": 0.3 }
  }],
  "audio": [],      // Faza 4
  "text": [],       // Faza 5 (relative units)
  "fx": []          // Faza 6
}
```

**Tuzoqlar:**

- Preview'ni canvas'ga o'tkazganda `<video>` seek kechikishi ko'rinadi. Yechim: kichik kadr keshi (oxirgi ko'rsatilgan kadrni ushlab tur — qora yaltirash yo'q), scrub paytida past sifat / to'xtaganda aniq kadr.
- Katta 4K/HEVC fayl preview'da sekin bo'ladi → **proxy** kerak (Faza 7).
- Bu fazani *bir kunda* buzib tashlama: har bosqichni alohida deploy qil, eski preview'ni feature flag orqasida saqla.

**DoD:** K-1 9:16 da to'g'ri; vertikal+gorizontal aralash loyiha ezilmaydi; float siljiydi/kattalashadi va export'da aynan shu joyda; preview va export skrinshotlari piksel-piksel yaqin (matnda 1–2 px farq ruxsat).

---

### FAZA 3 — Tezlik funksiyalari ("siqilmaydigan" faza)  · hajm: L

**Maqsad:** sen his qilgan "montaj qilguncha zerikish" ni to'g'ridan-to'g'ri kamaytirish. Bu — CapCut'dan farq qiladigan asosiy joy: **kamroq bosish**.

- [ ] **Jim joylarni avto-kes ("Silence remover")** — kundalik "gapirib turgan" videolar (vlog, dars, sharh) uchun eng katta vaqt tejagich.
  - Mantiq: audio 20 ms oynalarda RMS → `threshold` (dB slider) dan past va `minSilence` (masalan 0.4 s) dan uzun bo'laklar → ikki chetidan `padding` (0.1 s) qoldirib **kesish nuqtalari** → preview'da qizil belgilar bilan ko'rsat → "Qo'llash" bosilganda split + ripple delete.
  - Bitta undo qadami bo'lsin.
- [ ] **Snap (magnit):** clip chetlari playhead'ga, boshqa clip chetlariga, marker'larga 6–8 px ichida yopishadi; yopishganda vertikal yo'l-yo'riq chiziq; `Alt` bilan vaqtincha o'chirish; toggle tugma. (Hozir faqat playhead sudralganda 0.15 s snap bor — `timeline.js`.)
- [ ] **Inspector panel:** o'ng tomonda (mobilda pastdan chiqadigan sheet). Tanlangan clipning hamma sozlamasi bitta joyda: speed, volume, fade, transition, fit, transform, opacity. O'ng-klik menyu yengil bo'lib qoladi (split/duplicate/delete). Sozlamalar "yashirin" bo'lmasin — bu yangi foydalanuvchi uchun eng katta to'siq.
- [ ] **Klaviatura:**  `I`/`O` (in/out belgi), `Q`/`W` (playhead'gacha chapdan/o'ngdan kes — ripple), `J`/`K`/`L` (orqaga/to'xta/oldinga, takroriy bosish = tezroq), `,`/`.` (bir kadr), `Home`/`End`, `M` (marker), `Shift+Z` (hammasi ekranga sig'sin), `Shift+Delete` (bo'shliq qoldirib o'chirish; oddiy `Delete` = ripple). `?` — yorliqlar shpargalkasi.
- [ ] **Ko'p fayl import:** bir vaqtda 10 ta klip tashla → ketma-ket qo'yiladi; tartib: fayl nomi yoki suratga olingan vaqt (metadata bo'lsa).
- [ ] **Zoom-to-fit / zoom-to-selection**, timeline'da ovoz to'lqini video clip ustida (bor bo'lsa — aniqlik).
- [ ] **Qatordagi boshqaruv:** har video qator uchun mute / yashirish / qulflash.
- [ ] **Beat-sync (musiqa ritmiga kes):** musiqa peaks'idan oddiy onset/energiya aniqlash → ritm markerlari → "Clip chegaralarini ritmga tortish" yoki markerlarga snap. Qisqa videolar uchun juda "wow", murakkab AI kerak emas (energiya asosli oddiy algoritm). Sifatini o'zing testla.
- [ ] **Undo chuqurligi:** 30 → 100 (snapshot'lar yengil bo'lgani uchun tekshir; `File`/`Blob` nusxalanmaydi).
- [ ] **Freeze frame** (joriy kadrni N soniyaga cho'z) va **Reverse** (kichik klip uchun; uzun klipda ogohlantirish — reverse dekod xotirasi talab qiladi).
- [ ] **"Tez montaj" oqimi:** yangi loyiha → fayl(lar) → avto tartib + (ixtiyoriy) jim joylarni kes + musiqa qo'sh + subtitr (Faza 5 dan keyin) → bitta "Export". Yangi foydalanuvchi uchun asosiy yo'l.

**Texnik yo'l:** jim joy va beat uchun `AudioBuffer` o'rniga (B10) **peaks/energiya massivi** oldindan hisoblanadi va keshlanadi (Faza 7 da OPFS/IDB'ga). Og'ir hisob `Worker`da — UI qotmasin.

**DoD:** 5 daqiqalik gapirgan video: jim joylarni avto-kesish 10 soniyada ≤ 3 bosish bilan; K-1 ni klaviaturada 30% kamroq harakat bilan yig'ish mumkin (o'zingda vaqt o'lcha).

**Tuzoq:** Jim joy algoritmi shovqinli fonda yomon ishlaydi — threshold'ni slider qil va *preview'da eshittir*, jimgina qo'llama.

---

### FAZA 4 — Audio  · hajm: L

**Maqsad:** hozirgi "1 musiqa" cheklovidan chiqish; ovozli kontent (vlog, sharh) sifatini ko'tarish.

- [ ] **Model:** `state.music` → `state.audioClips[]` (`kind: 'music' | 'sfx' | 'voice'`), har birining `startTime, trim, gain, fadeIn/Out, track`. Migratsiya: eski `music` → bitta `audioClips[0]` (`schemaVersion` bilan).
- [ ] **Ko'p audio qator** timeline'da (music / sfx / voice), drag va trim video'niki bilan bir xil mexanika.
- [ ] **Waveform:** peaks massivi (masalan 100 peaks/sek), keshlanadi — `AudioBuffer`ni RAM'da ushlamaydi (B10).
- [ ] **Voice-over yozish:** `getUserMedia` + `MediaRecorder`, playhead'dan boshlab, "yozayotganda preview jim bo'lsin / naushnik" ogohlantirishi. **Avval `vercel.json`dagi `Permissions-Policy`da `microphone=(self)`ga o'zgartirish kerak** (hozir `microphone=()` — bloklangan).
- [ ] **Ducking:** voice yoki video ovozi bor joyda musiqa avtomatik pasayadi (masalan −12 dB, attack/release 150/400 ms). Export'da OfflineAudioContext'da gain envelope sifatida.
- [ ] **Ovoz > 100%:** `GainNode` orqali 200% gacha (clipping ogohlantirishi).
- [ ] **Normalizatsiya (sodda):** peak yoki RMS bo'yicha "ovozni tekislash" tugmasi. (To'liq LUFS — keyin, oddiy variant kundalik uchun yetadi.)
- [ ] **Videodan audioni ajratish** (detach): clip ovozi audio qatorga chiqadi, video mute bo'ladi.
- [ ] **Audio fade** ikkala tomonda va crossfade (transition paytida ovoz ham aralashsin — hozir chiquvchi clip ovozi ishlatiladi).
- [ ] **Speed + pitch:** 0.5–2× uchun pitch saqlash (preview'da `preservesPitch`; export'da time-stretch: SoundTouch kabi kichik WASM/JS). Aks holda "chipmunk" ovoz.
- [ ] (Ixtiyoriy) **Shovqinni kamaytirish:** RNNoise WASM — sifati zo'r, lekin hajm/mobil unumdorlik xavfi; Faza 9 dan keyingi backlog.
- [ ] **Bepul musiqa/SFX:** faqat *sen ruxsatli* (CC0 yoki o'zing yozgan) kichik kutubxona. Litsenziyasiz musiqa qo'shma — bu jiddiy yuridik xavf.

**Tuzoqlar:** iOS Safari `AudioContext`ni foydalanuvchi jesti bilan `resume()` qilishni talab qiladi · Bluetooth naushnikda voice-over kechikishi (latency) — yozuvni qo'lda siljitish tugmasi (offset) kerak bo'ladi.

**DoD:** musiqa + voice + SFX bir vaqtda, ducking ishlaydi, export'dagi ovoz preview bilan bir xil (quloq bilan A/B test).

---

## Progress log

**2026-09-20 — FAZA 0, band 1: Reproduce jadvali**
- Nima qilindi: B1–B15 ning har biri koddan (grep + qator-qator o'qish) tasdiqlandi yoki rad etildi; natija — yangi `REPRODUCE.md`.
- Fayllar: `REPRODUCE.md` (yangi), `work.md` (B3 statusi tuzatildi, checkbox belgilandi).
- Muhim topilma: **B3 bug emas ekan** — `js/canvas.js` (kanvas nisbat presetlari + `canvasDrawContain`) roadmap yozilgandan keyin allaqachon qo'shilgan ko'rinadi. FAZA 2A ("❌ Yo'q funksiyalar"da "kanvas nisbati" hali yo'q deyilgan joy) keyingi seansda qayta solishtirilishi kerak.
- Nima sinalmadi: brauzer bu muhitda yo'q — hech narsa haqiqatan ochib ko'rilmadi/skrinrekord qilinmadi. B4 (shrift oilasi), B7 (real fon-rejim simptomi), B8 (haqiqiy eshitiladigan A/V drift) faqat kod darajasida qisman tasdiqlandi, vizual/runtime tekshiruv kerak.
- Keyingi qadam: Faza 0'ning navbatdagi bandi — B1 (matn saqlanmasligi, `text_clips jsonb` migratsiya) yoki B9–B12/B14/B15 kabi kichik-aniq tuzatishlar.

**2026-09-20 — FAZA 0, band 2: B1 (matn overlay saqlanmasligi)**
- Nima qilindi: `migrations/001_add_text_clips.sql` (yangi, eski SQL'ga tegilmadi — loyihada eski SQL fayl topilmagan, shuning uchun migratsiya birinchi bo'ldi); `js/storage.js`da `rowToMeta` va `dbSaveProject`'ning `row` obyektiga `text_clips`/`textClips` ulandi.
- Fayllar: `migrations/001_add_text_clips.sql` (yangi), `js/storage.js` (2 joy o'zgardi), `work.md`.
- Tekshiruv: `node --check js/storage.js` — OK. Sof mantiq testi (meta→row→rowToMeta round-trip, 3 ta holat: matn bor / ustun yo'q / meta.textClips undefined) — 3/3 yashil.
- Nima sinalmadi: **SQL migratsiya Supabase'da hali qo'llanmagan** (sen qo'lda ishga tushirishing kerak) — shu qadar brauzerda "matn qo'sh → yangila → ochil" ssenariysi sinab ko'rilmadi. `projects.js`ga tegilmadi (u allaqachon to'g'ri edi).
- Keyingi qadam: navbatdagi kichik-aniq band — B9 (ko'p fayl drop) yoki B12 (bo'sh timeline holati) yoki B10 (AudioContext leak).

**2026-09-20 — FAZA 0, band 3: B9 (dashboard'ga ko'p fayl drop qilinsa faqat 1-tasi olinardi)**
- Nima qilindi: `handleFile`/`loadMediaAsMain`ni Promise qaytaradigan qildim (avvalgi callback-based koddan minimal o'zgarish — faqat `resolve()` qo'shildi, mavjud mantiq buzilmadi); yangi `handleFiles(fileList)` — birinchi faylni kutib yangi loyiha ochadi, qolganlarini `addMediaToTimeline` bilan ketma-ket qo'shadi (poyga holati bo'lmasin uchun ketma-ket `await`, parallel emas). Dashboard'dagi drop va fayl tanlash endi shuni chaqiradi; `#file-input`ga `multiple` qo'shildi.
- Fayllar: `js/upload.js`, `index.html` (1 qator), `work.md`.
- Tekshiruv: `node --check js/upload.js` — OK. Sof mantiq testi (`handleFiles`ning filtrlash + tartib logikasi, DOM'siz takrorlangan holda) — 3/3 yashil: (1) aralash video+rasm+video tartib bilan, (2) yaroqsiz fayl turi filtrlanadi, (3) bo'sh ro'yxatda toast.
- Nima sinalmadi: **brauzerda haqiqiy drag-drop bilan sinalmadi** — real `DataTransfer.files` va video metadata yuklanishining vaqt-ketma-ketligi (racing) faqat brauzerda to'liq tekshiriladi. Editor ichidagi drop (`add-media.js`) va paste (`upload.js:411`) — bu B9 doirasidan tashqarida, ular allaqachon ko'p faylni to'g'ri qabul qilar edi, tegilmadi.
- Keyingi qadam: B12 (bo'sh timeline holati) yoki B10 (AudioContext leak).

**2026-09-20 — FAZA 0, band 4: B12 (BACKLOG) va B10 (AudioContext leak)**
- B12: foydalanuvchidan variant so'radim ("aniq bilmayman" javobi keldi) — o'zim qaror qildim: **BACKLOG**ga qoldirdim, tegilmadi. Sabab: `state.videoClips[0]`ga 11 fayl/19+ joyda tayanilgan, real fix FAZA 2 (`render(t)`)da tabiiy chiqadi; hozirgi ikkita variant ham (loyihani o'chirish / faqat xabar) noto'g'ri signal beradi — halokatli yon ta'sir yoki soxta yechim.
- B10: Nima qilindi — `js/music.js:loadMusicFromFile`da `decodeAudioData`dan keyin `audioCtx.close()` (`try/finally`, muvaffaqiyat/xato ikkalasida ham). Butun faylni `AudioBuffer`ga dekod qilish (RAM tomoni) qasddan tegilmadi — bu Faza 4'ning peaks-massiv ishi, shu yerda yarim qilib qo'ysam ikki marta ishlashga to'g'ri keladi.
- Fayllar: `js/music.js`, `work.md`.
- Tekshiruv: `node --check js/music.js` — OK. Sof mantiq testi (`try/finally` close naqshi — muvaffaqiyat / decode xatosi / close()ning o'zi xato berishi, 3 holat) — 3/3 yashil.
- Nima sinalmadi: brauzerda haqiqiy `AudioContext` sonini (masalan Chrome DevTools > Memory) kuzatib, musiqani 10+ marta almashtirib, leak yo'qligini vizual tasdiqlash kerak — bu yerda qilinmadi.
- Keyingi qadam: B11 (kod gigiyenasi — `trackObjectUrl` ichma-ich ternary, `clipsTimeOverlap` dublikati) yoki B13/B14 (til aralashuvi, help sahifa) yoki B15 (ffmpeg lazy-load).

**2026-09-20 — FAZA 0, band 5: B11, B13/B14, B15 (Faza 0'ning qolgan kichik bandlari)**
- B11: `state.js`ga `createClip(overrides)` fabrikasi qo'shildi; `upload.js`dagi 4 ta clip-literal (3 ta `loadMediaAsMain` + 1 ta `addMediaToTimeline`) shunga o'tkazildi; `trackObjectUrl` ichma-ich ternary soddalashtirildi; `drag.js`dagi `clipsTimeOverlap` dublikati o'chirildi.
- B13/B14: `music.js` va `upload.js`dagi 4 ta ingliz toast o'zbekchaga o'girildi; `help/index.html`dagi ikkita eskirgan jumla ("Preview'da transition ko'rinmaydi", "Supabase + IndexedDB") va `projects.js`dagi mos izoh to'g'irlandi.
- B15: `index.html`dagi 2 ta statik ffmpeg `<script>` olib tashlandi; `export.js:getFFmpeg()` endi birinchi export chaqirilganda `loadFFmpegScripts()` bilan dinamik inject qiladi (parallel chaqiruvda ham bitta marta, CSP `script-src`da jsdelivr allaqachon bor edi — tegilmadi).
- Fayllar: `js/state.js`, `js/upload.js`, `js/drag.js`, `js/music.js`, `js/export.js`, `index.html`, `help/index.html`, `js/projects.js`, `work.md`.
- Tekshiruv: barcha o'zgargan `.js` fayllarda `node --check` — OK (state.js, upload.js, drag.js, music.js, export.js). Sof mantiq testlari: `createClip()` default/override (3/3), `loadFFmpegScripts` keshlash (2/2) — hammasi yashil.
- Nima sinalmadi: brauzerda — (1) rasm/video yuklab clip maydonlari to'g'ri chiqishini, (2) Network panelida ffmpeg endi sahifa ochilganda emas, faqat "MP4 export" bosilganda yuklanishini, (3) help sahifasini ko'zdan kechirib matn to'g'riligini. Bularning barchasi qo'lda bir marta tekshirilishi kerak.
- **FAZA 0 — 15/15 band ko'rib chiqildi** (B3 va B12 — tegilmagan/BACKLOG, sabablari yuqorida). Keyingi qadam: FAZA 1 (arxitektura — clipEnd/getFitSourceSize/schemaVersion) yoki B2/B3/B4/B5 uchun regressiya fixturalari (Faza 0'ning oxirgi bandi, hali qilinmagan).

**2026-09-21 — B15'ni avtomatik tekshiruvchi Playwright testi + B16 (tasodifiy topilgan kritik bug)**
- Nima qilindi (foydalanuvchi so'rovi bilan): `tests/verify-b15-ffmpeg-lazyload.mjs` — haqiqiy Chromium'da (production CSP/COOP/COEP header'lari bilan lokal server ko'tarib) B15'ni 6 bosqichda tekshiradi: (1) sahifa ochilganda ffmpeg so'rovi yo'q, (2) `window.getFFmpeg` mavjud, (3) birinchi chaqiruvda ffmpeg yuklanadi va ishlaydi, (4) ikkinchi chaqiruvda qayta yuklanmaydi (kesh). Auth uchun `auth.js`dagi tayyor `emr-dev-bypass` dev-mexanizmidan foydalanildi. `tests/package.json` (alohida, root'ga tegmaydi — Vercel'ning static deploy'ini buzmasin uchun), `tests/README.md` (bosqichma-bosqich ishga tushirish, o'zbekcha).
- **B16 (kutilmagan topilma):** shu testni haqiqiy brauzerda sinab ko'rish jarayonida `mobile-toolbar.js`da parse-vaqtidagi `SyntaxError` (qavs xato joylashgan) topildi — **butun fayl ishlamas edi** (mobilda undo/redo/copy/paste/split/float/dup/delete). Asl zip'da ham bor edi (mening B1-B15 tuzatishlarimga aloqasi yo'q, tekshirib ko'rdim). **Tuzatildi**, bug jadvaliga B16 sifatida qo'shildi.
- Fayllar: `tests/verify-b15-ffmpeg-lazyload.mjs`, `tests/package.json`, `tests/.gitignore`, `tests/README.md` (hammasi yangi), `js/mobile-toolbar.js` (B16 fix), `work.md`.
- Tekshiruv: `node --check js/mobile-toolbar.js` — OK. Test skriptini **shu muhitda o'zim ishga tushirdim** (Playwright + Chromium bor edi): [1/6]-[3/6] — barchasi ✅ o'tdi (sahifa to'g'ri ochiladi, ffmpeg oldindan yuklanmaydi, `getFFmpeg` mavjud). [4/6] (haqiqiy ffmpeg yuklash) — **bu muhitda tashqi tarmoq (cdn.jsdelivr.net) butunlay yopiq** bo'lgani uchun tekshira olmadim (`curl` ham 403 `host_not_allowed` qaytardi) — bu sandbox cheklovi, kod xatosi emas.
- Nima sinalmadi: [4/6]-[6/6] (haqiqiy ffmpeg yuklanishi + keshlanishi) — foydalanuvchi o'z kompyuterida (internet bilan) bir marta ishga tushirib tasdiqlashi kerak, `tests/README.md`da aniq yozilgan.
- Keyingi qadam: foydalanuvchi testni o'zida ishga tushirib natijani tasdiqlaydi; shundan keyin FAZA 1'ga yoki B2/B3/B4/B5 regressiya fixturalariga o'tish mumkin.

**2026-09-21 — FAZA 0, qolgan bandlar: B6, schemaVersion, global xato ushlovchi, export himoyasi, sof mantiq testlari, IndexedDB tavsifi tuzatildi**
- B6: `js/upload.js:getVideoDuration()` endi xato/timeout'da reject qiladi (avval jim `resolve(5)`), timeout 4s→15s. `addMediaToTimeline` va `loadMediaAsMain`ning `previewVideo.onerror` yo'li try/catch bilan ushlab `showToast('Bu formatni brauzer o'qiy olmadi (HEVC?). MP4 (H.264) ga aylantirib ko'ring')` ko'rsatadi, clip yaratmaydi/editorga o'tmaydi.
- schemaVersion: `js/projects.js`ga `PROJECT_SCHEMA_VERSION=1` + `migrateProjectMeta(meta)` (hozircha v0→v1 faqat versiya belgilaydi). `saveProjectNow` meta'siga qo'shildi, `openProject`da chaqiriladi. **Cheklov:** Supabase'da `schema_version` ustuni yo'q (SQL'ga tegilmadi, so'ralmagan edi) — hozircha faqat runtime'da, DB'da saqlanmaydi.
- Global xato ushlovchi: `index.html`ning eng boshiga (`auth-pending` skriptidan keyin, boshqa hamma `<script>`lardan OLDIN) `window.onerror`/`unhandledrejection` qo'shildi — konsolga struktura, `showToast` mavjud bo'lsa toast.
- Export himoyasi: `js/export.js`dagi `exportBtn` handlerga `beforeunload` guard va `navigator.wakeLock.request('screen')` (mavjud bo'lsa) qo'shildi, `finally`da tozalanadi.
- Sof mantiq testlari: `tests/logic.test.mjs` — Node `vm`+`assert` bilan (npm shart emas), `js/state.js`+`js/drag.js`ni sandbox'ga yuklab `clipDuration`, `timelineToSource`/`sourceToTimeline` (round-trip), `resolveVideoStartTimeOnTrack`, `getTransitionMaxDuration` — 13 test. `getTransitionLayers` kiritilmadi (so'ralmagan, murakkabroq).
- IndexedDB tavsifi: `js/state.js:37` izohi va `privacy/index.html` (haqiqiy maxfiylik sahifasi!) — ikkalasi ham "IndexedDB'da/faqat brauzerda saqlanadi" deb yozgan edi, bu noto'g'ri (Supabase Storage'ga yuklanadi). Ikkalasi ham to'g'irlandi.
- Fayllar: `js/upload.js`, `js/projects.js`, `index.html`, `js/export.js`, `tests/logic.test.mjs` (yangi), `js/state.js`, `privacy/index.html`, `work.md`.
- Tekshiruv: barcha `.js` fayl (`js/*.js`, jami 26 ta) `node --check` — OK. `node tests/logic.test.mjs` — **13/13 OK**, shu muhitda haqiqatan yugurtirildi.
- Nima sinalmadi: B6 xabari haqiqiy HEVC/buzuq fayl bilan; global error handler brauzerda haqiqiy xato tashlab; `beforeunload`/Wake Lock export paytida (Wake Lock HTTPS/localhost talab qiladi); `privacy/index.html`ni brauzerda ko'rib chiqish. B12 va B2/B3/B4/B5 fixturalariga ataylab tegilmadi (foydalanuvchi so'rovi).
- Keyingi qadam: B2/B3/B4/B5 regressiya fixturalari (Faza 0'ning yagona ochiq bandi) yoki FAZA 1'ga o'tish.

