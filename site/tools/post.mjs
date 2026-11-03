// After build.mjs: hero band in the pastel palette (no navy), the "Today in Wellby" card no longer
// overlapping the art, and the hero lede naming the teams Wellby is for. Idempotent; fails the build if it misses.
import { readFile, writeFile } from 'node:fs/promises';
const F = 'dist/index.html';
let h = await readFile(F, 'utf8');
const CSS = '<style id="band-pastel">.band{background:linear-gradient(#FCECDD,#FBF2EA 70%);color:var(--body)}.band :focus-visible{outline-color:var(--orange-ink)}.band h1{color:var(--ink)}.band h1 .pop{color:var(--orange-ink)}.band .lede{color:var(--body)}.band .fine{color:var(--muted)}.band .fine a{color:var(--ink)}.band .eyebrow.on-dark span{background:#000;color:#fff;box-shadow:-10px 0 0 0 #6B6A64,-20px 0 0 0 #B9B7B0,-30px 0 0 0 #E2E0DA}.band .btn-hero.w{background:#000;color:#fff}.band .btn-hero.w:hover{background:#222}.band .btn-hero.o{background:#fff;box-shadow:inset 0 0 0 1.5px #EBD9CB}.band .btn-hero.o:hover{background:#fff8f2}.band .hq{margin-top:0;box-shadow:0 24px 50px -30px rgba(120,64,30,.35),0 0 0 1px #F1E3D8}@media(max-width:820px){.band .hq{margin-top:28px}}</style>';
if (!h.includes('id="band-pastel"')) h = h.replace('</head>', CSS + '\n</head>');
const OLD = '<p class="lede">Know who to target, win their referrals, and prove it worked. Wellby shows';
const NEW = '<p class="lede">Wellby is built to supercharge your business development, sales and marketing teams. Know who to target, win their referrals, and prove it worked. It shows';
if (!h.includes(NEW)) h = h.replace(OLD, NEW);
if (!h.includes('id="band-pastel"') || !h.includes(NEW)) throw new Error('post pass missed');
// Payment wording: a card is added when the free trial starts (Stripe), charged only when the 14 days end.
const swaps = {
  'dist/index.html': [
    ['14 days free, then pay by card in the app', 'Add a card to start, nothing charged for 14 days'],
    ['Every plan starts with a 14-day free trial, and you pay by card in the app when it ends.', "Every plan starts with a 14-day free trial. You add a card when you sign up, and you're not charged until the trial ends. Cancel before then and you pay nothing."],
  ],
  'dist/pricing.html': [
    ["Sign up in the browser, pay by card when you're ready.", "Sign up in the browser and add a card; nothing is charged until your trial ends."],
    ["You'll pay by card, right in the app, once your trial ends.", "You add a card when you start your trial, and the first charge comes when the 14 days end. Cancel before then and you pay nothing."],
  ],
};
for (const [f, list] of Object.entries(swaps)) {
  let t = f === F ? h : await readFile(f, 'utf8');
  for (const [a, b] of list) { if (!t.includes(b)) t = t.split(a).join(b); if (!t.includes(b)) throw new Error('payment wording missed in ' + f); }
  if (f === F) h = t; else await writeFile(f, t);
}
await writeFile(F, h);
console.log('post pass done');
