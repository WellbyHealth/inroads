// After site.mjs: home hero in a "scene + statement" layout. Full-bleed clay landscape, a very large
// headline bottom-left on the art, a one-line "what it is" plus two buttons bottom-right, and a rounded
// panel rising underneath that holds the live "Today in Wellby" example. Fails the build if anchors are missing.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const F = 'dist/index.html';
const ART = 'https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m1755tffn5e2sk0hmyjwqy4ff98hh9tt-0.png';
let buf = null;
for (let i = 0; i < 4 && !buf; i++) { try { const r = await fetch(ART); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); } catch {} if (!buf) await new Promise(r => setTimeout(r, 1500)); }
if (!buf) throw new Error('hero art fetch failed');
for (const W of [3200, 2400, 1600, 1000]) await writeFile(`dist/img/g-hero-scene-${W}.webp`, await sharp(buf).resize(W).webp({ quality: 80, effort: 6 }).toBuffer());
// Phone: a 4:3 crop around the scene (the desk and buildings), the floor colour continues below it.
const m = await sharp(buf).metadata();
const cw = Math.round(m.width * .62), ch = Math.round(cw * 3 / 4);
const crop = await sharp(buf).extract({ left: Math.round((m.width - cw) / 2), top: Math.round(m.height * .04), width: cw, height: ch }).png().toBuffer();
for (const W of [1200, 800]) await writeFile(`dist/img/g-hero-scene-m-${W}.webp`, await sharp(crop).resize(W).webp({ quality: 80, effort: 6 }).toBuffer());

let h = await readFile(F, 'utf8');
if (!h.includes('class="hero hero2"')) {
  const a = h.indexOf('<section class="hero"'), b = h.indexOf('</section>', a) + 10;
  if (a < 0) throw new Error('hero section not found');
  const old = h.slice(a, b);
  const hq = old.match(/<div class="hq" id="hq"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/section>/);
  if (!hq) throw new Error('hq card not found');
  const card = hq[0].replace(/\s*<\/div>\s*<\/div>\s*<\/section>$/, '');
  const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const hero = `<section class="hero hero2" aria-labelledby="hero-title">
  <picture class="h2-art">
    <source media="(max-width: 760px)" srcset="/img/g-hero-scene-m-800.webp 800w, /img/g-hero-scene-m-1200.webp 1200w" sizes="100vw">
    <img src="/img/g-hero-scene-1600.webp" srcset="/img/g-hero-scene-1000.webp 1000w, /img/g-hero-scene-1600.webp 1600w, /img/g-hero-scene-2400.webp 2400w, /img/g-hero-scene-3200.webp 3200w" sizes="100vw" width="3200" height="1786" alt="Illustration: a clay desk whose monitor shows a map and a ranked list of referral sources, reaching a hospital, a doctor's office and a nursing facility by car visit, coffee, calls, calendar invites and email, set in pastel hills." fetchpriority="high">
  </picture>
  <div class="wrap h2-copy">
    <h1 id="hero-title">Find &amp; win more referrals.</h1>
    <div class="h2-side">
      <p class="h2-what">See every hospital and doctor around you, win their referrals with outreach agents draft for you, and prove what it won.</p>
      <div class="h2-ctas"><a class="h2-btn w" href="https://inroad-app.vercel.app/signup">Start free trial ${ARROW}</a><a class="h2-btn y" href="#how">See how it works ${ARROW}</a></div>
      <p class="h2-fine">For post-acute business development, sales and marketing teams. <span style="white-space:nowrap">14-day free trial.</span></p>
    </div>
  </div>
  <form id="capture" hidden><input id="capture-email" type="email" tabindex="-1" aria-hidden="true"></form>
</section>
<section class="h2-panel" aria-labelledby="day-title">
  <div class="h2-panel-in">
    <div class="stage" id="hero-flow" aria-hidden="true"><div class="pano"></div></div>
    <div class="h2-day">
      <p class="eyebrow"><span>Your team's day</span></p>
      <h2 id="day-title">New referrals counted, sources ranked, <span class="pop">outreach drafted.</span></h2>
      <p>Every morning Wellby is built to read the referrals you received, update each source's score and your share, and queue the check-ins and thank-yous for your marketers to approve and send from their own email.</p>
    </div>
    ${card.trim()}
  </div>
</section>`;
  h = h.slice(0, a) + hero + h.slice(b);
  // Preload the new art instead of the old hero images.
  h = h.replace(/<link rel="preload" as="image" href="\/img\/g-hero-desk2?-1600\.webp"[^>]*>/, '<link rel="preload" as="image" href="/img/g-hero-scene-1600.webp" imagesrcset="/img/g-hero-scene-1000.webp 1000w, /img/g-hero-scene-1600.webp 1600w, /img/g-hero-scene-2400.webp 2400w, /img/g-hero-scene-3200.webp 3200w" imagesizes="100vw" media="(min-width: 761px)" fetchpriority="high">');
  h = h.replace(/<link rel="preload" as="image" href="\/img\/g-hero-desk2?-tall-900\.webp"[^>]*>/, '<link rel="preload" as="image" href="/img/g-hero-scene-m-800.webp" imagesrcset="/img/g-hero-scene-m-800.webp 800w, /img/g-hero-scene-m-1200.webp 1200w" imagesizes="100vw" media="(max-width: 760px)" fetchpriority="high">');
  const CSS = `<style id="hero2">
.hero2{position:relative;margin-top:-68px;padding-top:44px;background:linear-gradient(#D9DDFB 0,#D9DDFB 80px,#FBCDB9 80px);overflow:hidden}
.h2-art img{display:block;width:100%;height:clamp(500px,46vw,800px);object-fit:cover;object-position:50% 0}
.h2-copy{position:relative;margin-top:calc(-1*clamp(80px,9.5vw,170px));padding-bottom:clamp(110px,9vw,150px);display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:clamp(28px,5vw,80px);align-items:end}
.hero2 h1{font-size:clamp(3.4rem,6.6vw,6.2rem);line-height:.92;letter-spacing:-.055em;font-weight:620;color:#1c1916;margin:0;text-wrap:balance}
.h2-what{font-size:clamp(18px,1.6vw,23px);line-height:1.4;color:#2b2723;letter-spacing:-.01em;margin:0;max-width:26em}
.h2-ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.h2-btn{display:inline-flex;align-items:center;gap:14px;height:58px;padding:0 22px 0 24px;border-radius:12px;font-size:18px;font-weight:620;letter-spacing:-.01em;color:#000;text-decoration:none;transition:transform .16s var(--ease),background .15s}
.h2-btn svg{width:18px;height:18px;transition:transform .2s var(--ease)}.h2-btn:hover{transform:translateY(-2px)}.h2-btn:hover svg{transform:translateX(3px)}
.h2-btn.w{background:#fff}.h2-btn.w:hover{background:#fdf8f4}.h2-btn.y{background:#F7DC6F}.h2-btn.y:hover{background:#f3d257}
.h2-btn:focus-visible{outline:3px solid #1c1916;outline-offset:3px}
.h2-fine{margin:16px 0 0;font-size:14.5px;color:#5b524b}
.h2-panel{position:relative;z-index:2;margin-top:clamp(-96px,-7vw,-64px);padding:0 clamp(12px,3vw,40px)}
.h2-panel-in{position:relative;max-width:1240px;margin:0 auto;background:var(--bg);border-radius:40px 40px 0 0;padding:clamp(40px,5vw,72px) clamp(20px,4vw,64px) 0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(28px,5vw,72px);align-items:center}
.h2-day h2{margin-top:14px;font-size:clamp(1.9rem,3.2vw,2.8rem);line-height:1.08}.h2-day p:last-child{margin-top:16px;font-size:18px;line-height:1.5;color:var(--body);max-width:30em}
.h2-panel .hq{margin:0;box-shadow:0 24px 50px -30px rgba(120,64,30,.35),0 0 0 1px #EFE7DF}
#hero-flow{position:absolute;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none}
@media(min-width:901px) and (max-width:1120px){
.h2-copy{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px}
.h2-btn{height:52px;font-size:16.5px;padding:0 16px 0 18px;gap:10px}
}
@media(max-width:900px){
.h2-art img{height:auto;aspect-ratio:16/9}
.h2-copy{margin-top:0;grid-template-columns:minmax(0,1fr);gap:22px;padding-top:12px;padding-bottom:110px}
.hero2 h1{font-size:clamp(3rem,11vw,5.6rem)}
.h2-what{max-width:32em}
.h2-panel-in{grid-template-columns:minmax(0,1fr)}
}
@media(max-width:760px){
.hero2{padding-top:68px}
.h2-art img{height:auto;aspect-ratio:4/3;object-position:50% 50%}
.h2-copy{margin-top:0;grid-template-columns:minmax(0,1fr);gap:18px;padding-top:8px;padding-bottom:110px}
.hero2 h1{font-size:clamp(3rem,14vw,4.4rem)}
.h2-btn{flex:1 1 auto;justify-content:space-between}
.h2-panel-in{grid-template-columns:minmax(0,1fr);border-radius:28px 28px 0 0}
}
</style>`;
  h = h.replace('</head>', CSS + '\n</head>');
}
if (!h.includes('class="hero hero2"') || !h.includes('id="hq"') || !h.includes('id="hero-flow"')) throw new Error('hero2 pass missed');
await writeFile(F, h);
// Specialties: tabs in a column on the left, the selected specialty on the right (a scrolling row on phones).
{
  const S = 'dist/specialties.html';
  let p = await readFile(S, 'utf8');
  if (!p.includes('class="sp-layout"')) {
    const a = p.indexOf('<div class="sp-tabs"');
    const last = p.lastIndexOf('</article>');
    const close = p.indexOf('</div>', last);
    if (a < 0 || last < 0 || close < 0) throw new Error('specialties tabs not found');
    p = p.slice(0, a) + '<div class="sp-layout">' + p.slice(a, close + 6) + '</div>' + p.slice(close + 6);
    p = p.replace('<div class="sp-tabs" role="tablist"', '<div class="sp-tabs" role="tablist" aria-orientation="vertical"');
    p = p.replace('</head>', `<style id="sp-side">
.sp-layout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:clamp(20px,3vw,36px);align-items:start;margin-top:clamp(8px,2vw,20px)}
.sp-layout .sp-tabs{display:flex;flex-direction:column;gap:4px;margin:0;position:sticky;top:96px;max-height:calc(100vh - 120px);overflow-y:auto;padding:6px;background:#fff;border:1px solid var(--line-soft);border-radius:22px;scroll-margin-top:96px}
.sp-layout .sp-tab{flex-direction:row;justify-content:flex-start;align-items:center;text-align:left;gap:12px;padding:7px 12px 7px 8px;border-radius:14px;border:0;background:none;font-size:15px;line-height:1.25;min-height:48px}
.sp-layout .sp-tab img{width:36px;height:36px;flex:none}
.sp-layout .sp-tab:hover{transform:none;box-shadow:none;background:var(--stone)}
.sp-layout .sp-tab[aria-selected="true"]{background:#000;color:#fff;box-shadow:none}
.sp-layout .sp-tab[aria-selected="true"] img{transform:scale(1.1)}
.sp-layout .sp-panels{min-width:0}
@media(max-width:900px){.sp-layout{grid-template-columns:minmax(0,1fr)}.sp-layout .sp-tabs{flex-direction:row;position:static;max-height:none;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity}.sp-layout .sp-tab{flex:0 0 auto;scroll-snap-align:start}}
</style>
</head>`);
    await writeFile(S, p);
  }
}
// All pages: use the compact header menu up to 900px wide (the full nav no longer fits on tablets).
{
  const { readdir } = await import('node:fs/promises');
  const NAVCSS = '<style id="nav-tablet">@media(min-width:701px) and (max-width:900px){.bar{position:relative}.bar nav{display:none}.menu-btn{display:grid;place-items:center;width:40px;height:40px;flex:none;border-radius:12px;background:var(--stone);border:0;color:#000;cursor:pointer}.menu-btn svg{width:20px;height:20px}.mnav{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:40;display:grid!important;gap:2px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:8px;box-shadow:0 24px 48px -24px rgba(0,0,0,.4)}.mnav[hidden]{display:none!important}.mnav a{padding:14px;border-radius:12px;font-weight:600;font-size:17px;color:var(--ink);text-decoration:none}}</style>';
  const walk = async d => (await Promise.all((await readdir(d, { withFileTypes: true })).map(e => e.isDirectory() ? (e.name === 'img' || e.name === 'fonts' ? [] : walk(`${d}/${e.name}`)) : [`${d}/${e.name}`]))).flat();
  for (const f of (await walk('dist')).filter(f => f.endsWith('.html'))) {
    const t = await readFile(f, 'utf8');
    if (t.includes('class="menu-btn"') && !t.includes('id="nav-tablet"')) await writeFile(f, t.replace('</head>', NAVCSS + '\n</head>'));
  }
}
console.log('hero2 pass done');
