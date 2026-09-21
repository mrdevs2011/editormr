# B15 (ffmpeg lazy-load) — avtomatik brauzer testi

Bu papkadagi `verify-b15-ffmpeg-lazyload.mjs` haqiqiy Chromium'da (Playwright
orqali) loyihani ochib, tekshiradi:

1. Sahifa ochilganda **ffmpeg so'rovi yo'q** (network'da kuzatiladi).
2. `window.getFFmpeg` funksiyasi mavjud.
3. Uni birinchi chaqirganda ffmpeg **endi** yuklanadi va xatosiz ishlaydi.
4. Ikkinchi chaqirganda **qayta yuklanmaydi** (keshlanadi).

Loyihaning o'zi Supabase login talab qiladi, lekin `auth.js`dagi tayyor
**dev-bypass** mexanizmidan foydalaniladi (`sessionStorage['emr-dev-bypass']`)
— haqiqiy login kerak emas.

## 1-qadam: Node.js borligini tekshir

```bash
node --version   # 18+ bo'lsa yetarli
```

Yo'q bo'lsa: https://nodejs.org dan o'rnat.

## 2-qadam: shu papkaga kir va paketlarni o'rnat

```bash
cd EMR/tests
npm install
```

Bu faqat `tests/node_modules` ichiga o'rnatiladi — loyihaning qolgan
qismiga (Vercel deploy'iga) hech qanday ta'siri yo'q (root'da
`package.json` yo'q, atayin shunday qilingan).

## 3-qadam: Chromium'ni yukla (Playwright'ning o'zi uchun, bir martalik)

```bash
npx playwright install chromium
```

Linux serverda (masalan Ubuntu) agar tizim kutubxonalari yetishmasa:

```bash
npx playwright install --with-deps chromium
```

## 4-qadam: testni ishga tushir

```bash
npm run test:b15
```

yoki to'g'ridan-to'g'ri:

```bash
node verify-b15-ffmpeg-lazyload.mjs
```

## Natijani o'qish

Muvaffaqiyatli bo'lsa, oxirida shu chiqadi:

```
✅ B15 TASDIQLANDI: ffmpeg faqat kerak bo'lganda, bir marta yuklanadi.
```

va process **0** kod bilan tugaydi (CI'da ham ishlatsa bo'ladi — muvaffaqiyatsiz
bo'lsa **1** qaytaradi).

Muvaffaqiyatsiz bo'lsa, qaysi tekshiruv (`[1/6]`...`[6/6]`) va aynan qaysi
`assert` yiqilganini ko'rsatadi, hamda oxirgi 20 ta network so'rovini chiqarib
beradi — shu ro'yxatdan nima sodir bo'lganini taxmin qilish mumkin.

### Muhim: 4-qadam haqiqiy internet talab qiladi

`[4/6]` va undan keyingi bosqichlar `cdn.jsdelivr.net`dan haqiqiy fayl
yuklaydi (ffmpeg.wasm kutubxonasi, ~30MB gacha bo'lishi mumkin — birinchi
marta biroz sekin ketishi normal). Agar kompyuteringizda internet yo'q yoki
`cdn.jsdelivr.net` bloklangan bo'lsa (masalan korporativ tarmoq/firewall),
`[4/6]` shu bosqichda tabiiy ravishda yiqiladi — bu B15 tuzatishning o'zida
xato degani emas, faqat tarmoq yo'qligi.

*(Men — Claude — bu testni o'z muhitimda `[1/6]`–`[3/6]`gacha ishlatib
ko'rdim: hammasi o'tdi. `[4/6]`ni esa mening muhitimda tashqi tarmoq
butunlay yopiq bo'lgani uchun tekshira olmadim — shuning uchun buni sizning
kompyuteringizda, haqiqiy internet bilan bir marta ishga tushirib
tasdiqlashingizni so'rayman.)*

## Bonus: shu test orqali topilgan va tuzatilgan xato

Testni yozish jarayonida sahifa haqiqiy Chromium'da ochilganda **pageerror**
chiqdi: `SyntaxError: Unexpected token 'else'` — manbasi `js/mobile-toolbar.js:98`
ekan (noto'g'ri joylashgan qavs — `if/else if` zanjiri buzilgan edi). Bu —
**parse-vaqtidagi xato**, ya'ni butun `mobile-toolbar.js` fayli umuman
ishga tushmay qolardi — mobil qurilmada undo/redo/copy/paste/split/float/
dup/delete tugmalarining **hech biri ishlamas edi**. Bu xato asl
(o'zgartirilmagan) zip'da ham bor edi — B1-B15 ro'yxatiga kirmagan,
tasodifan shu test orqali topildi. Tuzatildi (`work.md`da yozilgan).

## Muammolarni bartaraf qilish

- **`EADDRINUSE` / port band**: skript ichida `PORT = 8934` — agar shu port
  band bo'lsa, faylni ochib shu qiymatni o'zgartiring.
- **CSP xatosi ("unsafe-eval")**: agar kelajakda shu skriptga o'zingiz
  `page.evaluate('...satr...')` yoki `page.waitForFunction('...satr...')`
  qo'shsangiz — ishlamaydi, chunki test production'dagi CSP'ni aynan
  takrorlaydi (`script-src`da `'unsafe-eval'` yo'q). Har doim **funksiya**
  shaklida yozing: `page.evaluate(() => ...)`, satr emas.
- **Playwright chromium topilmadi**: 3-qadamni qayta bajaring.
