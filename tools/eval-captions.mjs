#!/usr/bin/env node
// WER jadvali: papkadagi *.wav + yonidagi *.txt ishonchli matn.
// transformers.js tarmoq orqali model yuklaydi — sinalmagan.
// Ishlatish: node tools/eval-captions.mjs <papka>
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/text-core.js'), 'utf8');
const sandbox = { console, globalThis: {}, TextDecoder, TextEncoder, Uint8Array };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { computeWer } = sandbox.TextCore;

const dir = process.argv[2];
if (!dir) {
  console.log('Foydalanish: node tools/eval-captions.mjs <audio-papka>');
  console.log('Har wav yonida .txt ishonchli matn. 30 ta real video bilan o\'lchang.');
  process.exit(0);
}

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.wav'));
if (!files.length) {
  console.log('wav topilmadi. Model yugurtirish tarmoq+transformers talab qiladi — shu skript hozir faqat WER hisoblay oladi agar hyp.txt bersangiz.');
}

for (const f of files) {
  const base = f.replace(/\.wav$/i, '');
  const refp = path.join(dir, base + '.txt');
  const hypp = path.join(dir, base + '.hyp.txt');
  if (!fs.existsSync(refp) || !fs.existsSync(hypp)) {
    console.log('SKIP', base, '(ref yoki hyp yoq — avval modelni ishlatib .hyp.txt yozing)');
    continue;
  }
  const ref = fs.readFileSync(refp, 'utf8');
  const hyp = fs.readFileSync(hypp, 'utf8');
  console.log(base, 'WER', computeWer(ref, hyp).toFixed(3));
}
