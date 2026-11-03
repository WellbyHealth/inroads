// After hero2.mjs: hero formatting fixes from the size audit (two-line headline on wide screens, a
// balanced mid-size layout, stacked copy on tablets) and the compact header menu up to 900px wide.
import { readFile, writeFile, readdir } from 'node:fs/promises';
const FIX = `<style id="hero2b">
.h2-art img{height:clamp(380px,min(46vw,calc(100svh - 320px)),800px);object-position:50% 18%;-webkit-mask-image:linear-gradient(#000 68%,transparent 100%);mask-image:linear-gradient(#000 68%,transparent 100%)}
.h2-copy{margin-top:calc(-1*clamp(24px,4svh,90px));padding-bottom:clamp(104px,9vw,150px);grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);align-items:end}
.hero2 h1{font-size:clamp(3.2rem,min(6.6vw,11.5svh),6.2rem)}
.h2-what{font-size:clamp(17px,min(1.6vw,2.7svh),23px);max-width:26em}
.h2-ctas{margin-top:clamp(16px,2.6svh,26px)}
.h2-btn{height:clamp(48px,7svh,58px)}
.h2-fine{margin-top:clamp(10px,1.6svh,16px)}
@media(min-width:901px) and (max-width:1120px){.h2-copy{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px}.h2-btn{font-size:16.5px;padding:0 16px 0 18px;gap:10px}}
@media(max-width:900px){.h2-art img{height:auto;aspect-ratio:16/9;object-position:50% 0;-webkit-mask-image:linear-gradient(#000 80%,transparent 100%);mask-image:linear-gradient(#000 80%,transparent 100%)}.h2-copy{margin-top:0;grid-template-columns:minmax(0,1fr);gap:22px;padding-top:12px;padding-bottom:110px}.hero2 h1{font-size:clamp(3rem,11vw,5.6rem)}.h2-what{max-width:32em;font-size:19px}.h2-btn{height:56px}.h2-panel-in{grid-template-columns:minmax(0,1fr)}}
@media(max-width:760px){.h2-art img{aspect-ratio:4/3;object-position:50% 50%}.h2-copy{gap:18px;padding-top:8px}.hero2 h1{font-size:clamp(3rem,14vw,4.4rem)}}
</style>`;
const NAVCSS = '<style id="nav-tablet">@media(min-width:701px) and (max-width:900px){.bar{position:relative}.bar nav{display:none}.menu-btn{display:grid;place-items:center;width:40px;height:40px;flex:none;border-radius:12px;background:var(--stone);border:0;color:#000;cursor:pointer}.menu-btn svg{width:20px;height:20px}.mnav{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:40;display:grid!important;gap:2px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:8px;box-shadow:0 24px 48px -24px rgba(0,0,0,.4)}.mnav[hidden]{display:none!important}.mnav a{padding:14px;border-radius:12px;font-weight:600;font-size:17px;color:var(--ink);text-decoration:none}}</style>';
const walk = async d => (await Promise.all((await readdir(d, { withFileTypes: true })).map(e => e.isDirectory() ? (e.name === 'img' || e.name === 'fonts' ? [] : walk(`${d}/${e.name}`)) : [`${d}/${e.name}`]))).flat();
for (const f of (await walk('dist')).filter(f => f.endsWith('.html'))) {
  let t = await readFile(f, 'utf8'), u = t;
  if (u.includes('class="menu-btn"') && !u.includes('id="nav-tablet"')) u = u.replace('</head>', NAVCSS + '\n</head>');
  if (f === 'dist/index.html' && !u.includes('id="hero2b"')) { if (!u.includes('id="hero2"')) throw new Error('hero2 styles missing'); u = u.replace('</head>', FIX + '\n</head>'); }
  if (u !== t) await writeFile(f, u);
}
console.log('hero3 pass done');
