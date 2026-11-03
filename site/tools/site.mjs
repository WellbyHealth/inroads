// After post.mjs: blog pages, site-wide SEO (titles, descriptions, structured data, sitemap, llms.txt),
// a Blog link in every header and footer, pastel panels instead of navy, and larger tap targets.
// Idempotent where it edits existing pages; fails the build if an expected anchor is missing.
import sharp from 'sharp';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { POSTS } from './posts.mjs';

const D = 'dist', SITE = 'https://wellbyinroads.com', TODAY = '2026-11-03';
const read = f => readFile(`${D}/${f}`, 'utf8');
const write = (f, t) => writeFile(`${D}/${f}`, t);
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const must = (ok, what) => { if (!ok) throw new Error('site pass missed: ' + what); };
const fmt = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const ORG = { '@type': 'Organization', name: 'Wellby Health', url: SITE + '/', logo: SITE + '/icon-512.png', email: 'team@wellbyhealth.com' };
const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const crumbs = list => ({ '@type': 'BreadcrumbList', itemListElement: list.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })) });

// Site-wide CSS: pastel panels (no navy), larger tap targets, blog styles.
const CSS = `<style id="site-fixes">
.panel.navy{background:linear-gradient(160deg,#EAF2FD,#F2EDFB);color:var(--body)}#waitlist .panel.navy{background:linear-gradient(160deg,#FCECDD,#FBF2EA)}
.panel.navy h2{color:var(--ink)}.panel.navy .pop{color:var(--orange-ink)}.navy :focus-visible{outline-color:var(--orange-ink)}
.eyebrow.on-dark span{background:#000;color:#fff;box-shadow:-10px 0 0 0 #6B6A64,-20px 0 0 0 #B9B7B0,-30px 0 0 0 #E2E0DA}
.product-hint{color:var(--muted)}.panel.navy .tag{border-color:rgba(13,39,71,.22);color:var(--ink)}
.panel.navy .seg{background:rgba(255,255,255,.75);border-color:#d9dee8}.panel.navy .seg button{color:#3b3a36}.panel.navy .seg button[aria-pressed="true"]{background:#000;color:#fff}
.join-copy p,.perks{color:var(--body)}.join-copy .join-alt{color:var(--muted)}.join-alt a,.join-signin{color:var(--ink)}.join-signin:hover{color:#000}
.panel.navy .btn-cta{background:#000;color:#fff}.panel.navy .btn-cta:hover{background:#222}
.pr-alt,.join-signin,.sp-pn a,.dd-all,.cmp-links a{display:inline-flex;align-items:center;min-height:44px}
.blog-head{padding-top:72px;max-width:760px}.blog-head p{color:var(--muted);font-size:18px;margin-top:14px;max-width:36em}
.blog-grid{list-style:none;padding:0;margin:36px 0 96px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
.post-card a{display:flex;flex-direction:column;height:100%;background:#fff;border:1px solid var(--line-soft);border-radius:24px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .2s var(--ease),box-shadow .2s}
.post-card a:hover{transform:translateY(-3px);box-shadow:0 18px 40px -28px rgba(13,39,71,.35)}
.post-card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}.pc-b{padding:20px 22px 24px;display:flex;flex-direction:column;flex:1}
.pc-tag{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--orange-ink)}
.post-card h2,.post-card h3{font-size:1.22rem;line-height:1.25;letter-spacing:-.02em;margin:8px 0 8px}.pc-p{display:block;color:var(--muted);font-size:15.5px;line-height:1.5}
.pc-meta{margin-top:auto;padding-top:14px;font-size:13.5px;color:var(--muted)}
.crumbs{font-size:14px;color:var(--muted);margin-bottom:18px}.crumbs a{color:inherit;text-underline-offset:3px;display:inline-block;padding:12px 2px}
.art-tag{font-size:12.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--orange-ink);margin-bottom:10px}
.art-cover{margin:28px 0 6px;border-radius:24px;overflow:hidden}.art-cover img{display:block;width:100%;height:auto}
.takeaways{background:var(--peach);border-radius:20px;padding:20px 24px 22px;margin:28px 0 8px}.takeaways h2{margin:0 0 6px!important;font-size:1.05rem!important}
.doc ul{margin:10px 0 0;padding-left:1.25em}.doc li{margin-top:7px;max-width:38em;line-height:1.55}.doc p{line-height:1.6}
.doc blockquote{margin:14px 0 0;padding:14px 20px;background:#fff;border:1px solid var(--line-soft);border-left:4px solid var(--peach-2);border-radius:0 16px 16px 0}.doc blockquote p{margin:0}
.art-cta{margin:48px 0 0;padding:28px 28px 30px;border-radius:24px;background:linear-gradient(160deg,#EAF2FD,#F2EDFB)}.art-cta h2{margin:0 0 8px!important}.art-cta .btn-cta{margin-top:18px;background:#000;color:#fff}
.related{margin-top:56px}.related .blog-grid{margin:18px 0 0;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}@media(max-width:700px){.related .blog-grid{grid-template-columns:minmax(0,1fr)}}
.home-blog .blog-grid{margin:28px 0 0}.home-blog .sp-more{margin-top:22px}
</style>`;

// 0) Pastel version of the sign-up panel art (the original has a navy wall).
{
  let buf = null;
  for (let i = 0; i < 4 && !buf; i++) { try { const r = await fetch('https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17c4kcj4kfytkkks7w97egxws8hhemz-0.png'); if (r.ok) buf = Buffer.from(await r.arrayBuffer()); } catch {} if (!buf) await new Promise(r => setTimeout(r, 1500)); }
  must(buf, 'garden art fetch');
  for (const W of [1600, 900]) await writeFile(`${D}/img/g-art-garden2-${W}.webp`, await sharp(buf).resize(W).webp({ quality: 80, effort: 6 }).toBuffer());
}
// 1) Header/footer Blog link, site CSS, robots meta, on every existing page.
const PAGES = ['index.html', 'pricing.html', 'specialties.html', 'privacy.html', '404.html', 'compare/trella.html', 'compare/definitive-healthcare.html'];
const html = {};
for (const f of PAGES) {
  let h = await read(f);
  if (!h.includes('href="/blog"')) h = h.replace(/(<a href="\/pricing"(?: aria-current="page")?>Pricing<\/a>)/g, '$1<a href="/blog">Blog</a>');
  must(h.includes('href="/blog"'), 'blog link in ' + f);
  if (!h.includes('id="site-fixes"')) h = h.replace('</head>', CSS + '\n</head>');
  if (f !== '404.html' && !h.includes('max-image-preview')) h = h.replace('<meta name="viewport"', '<meta name="robots" content="index,follow,max-image-preview:large">\n<meta name="viewport"');
  h = h.replace(/og\.jpg\?v=20261103(?!e)/g, 'og.jpg?v=20261103e');
  if (f === 'index.html') h = h.split('/img/g-art-garden-').join('/img/g-art-garden2-');
  html[f] = h;
}
// The privacy page had no main navigation: give it the full header.
{
  const hdr = html['index.html'].match(/<header class="hdr">[\s\S]*?<\/header>/)[0];
  html['privacy.html'] = html['privacy.html'].replace(/<header class="hdr">[\s\S]*?<\/header>/, hdr);
  if (!html['privacy.html'].includes('nav.js')) html['privacy.html'] = html['privacy.html'].replace('</body>', '<script src="/nav.js" defer></script>\n</body>');
  html['privacy.html'] = html['privacy.html'].replace(/<meta name="robots" content="index,follow">\n?/, '');
}

// 2) Titles and descriptions (search snippets: titles under ~60, descriptions under ~160 characters).
const META = {
  'index.html': ['Wellby: Referral Growth Software for Post-Acute Care', 'Wellby maps every referral source around your offices, shows your share of each one, and drafts the follow-up for your team. Start a 14-day free trial.'],
  'pricing.html': ['Pricing: Referral Software for Post-Acute Care | Wellby', 'Wellby plans for home health, hospice and other post-acute providers. Every plan starts with a 14-day free trial. Self-serve, no sales call.'],
  'specialties.html': ['Referral Software for 18 Care Specialties | Wellby', 'Built for home health, hospice, skilled nursing, home care, behavioral health and more. See who refers to you and win more referrals in each specialty.'],
  'compare/trella.html': ['Wellby vs Trella Health: Comparison | Wellby', 'Trella Health gives you claims data and a CRM. Wellby is built to do the outreach work: rank who to contact, draft every message and follow up.'],
  'compare/definitive-healthcare.html': ['Wellby vs Definitive Healthcare: Comparison | Wellby', 'Definitive Healthcare gives you market data. Wellby is built to turn it into referrals: ranked outreach, drafted messages and follow-up until partners reply.'],
  'privacy.html': ['Privacy Notice | Wellby', 'How Wellby handles the information you share through the wellbyinroads.com website.'],
};
const setMeta = (h, title, desc) => {
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  h = h.replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(desc)}"`);
  h = h.replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*"/g, `$1${esc(title)}"`);
  h = h.replace(/(<meta (?:property|name)="(?:og|twitter):description" content=")[^"]*"/g, `$1${esc(desc)}"`);
  return h;
};
for (const [f, [t, d]] of Object.entries(META)) { html[f] = setMeta(html[f], t, d); must(html[f].includes(`<title>${esc(t)}</title>`), 'title ' + f); }
// Privacy: canonical and share tags. 404: no canonical (it is noindex).
if (!html['privacy.html'].includes('rel="canonical"')) html['privacy.html'] = html['privacy.html'].replace('</head>', `<link rel="canonical" href="${SITE}/privacy">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Wellby">\n<meta property="og:title" content="Privacy Notice | Wellby">\n<meta property="og:url" content="${SITE}/privacy">\n<meta property="og:image" content="${SITE}/og.jpg?v=20261103e">\n<meta name="twitter:card" content="summary_large_image">\n</head>`);
html['404.html'] = html['404.html'].replace(/<link rel="canonical"[^>]*>\n?/, '').replace(/<meta property="og:url"[^>]*>\n?/, '');

// 3) Structured data.
{
  let h = html['index.html'];
  const faqs = [...h.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(m => ({ '@type': 'Question', name: strip(m[1]), acceptedAnswer: { '@type': 'Answer', text: strip(m[2]) } }));
  must(faqs.length >= 8, 'faq items');
  h = h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ld({ '@context': 'https://schema.org', '@graph': [
    { ...ORG, '@id': SITE + '/#org' },
    { '@type': 'WebSite', '@id': SITE + '/#site', name: 'Wellby', url: SITE + '/', publisher: { '@id': SITE + '/#org' } },
    { '@type': 'SoftwareApplication', name: 'Wellby', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: SITE + '/', description: 'Referral intelligence and a system of action for post-acute care business development, sales and marketing teams. Know who to target, win their referrals, and prove it worked.', publisher: { '@id': SITE + '/#org' } },
    { '@type': 'FAQPage', mainEntity: faqs },
  ] }));
  html['index.html'] = h;
  const BC = { 'pricing.html': [['Home', '/'], ['Pricing', '/pricing']], 'specialties.html': [['Home', '/'], ['Specialties', '/specialties']], 'compare/trella.html': [['Home', '/'], ['Wellby vs Trella Health', '/compare/trella']], 'compare/definitive-healthcare.html': [['Home', '/'], ['Wellby vs Definitive Healthcare', '/compare/definitive-healthcare']], 'privacy.html': [['Home', '/'], ['Privacy', '/privacy']] };
  for (const [f, list] of Object.entries(BC)) if (!html[f].includes('"BreadcrumbList"')) html[f] = html[f].replace('</head>', ld({ '@context': 'https://schema.org', ...crumbs(list) }) + '\n</head>');
}

// 4) Blog. Built from the pricing page shell so header, footer and scripts match.
const shell = html['pricing.html'];
const top = shell.slice(shell.indexOf('<body'), shell.indexOf('<main id="main">')).replace(/ aria-current="page"/g, '').replace('<a href="/blog">Blog</a>', '<a href="/blog" aria-current="page">Blog</a>');
const bottom = shell.slice(shell.indexOf('</main>') + 7);
must(top.includes('<header') && bottom.includes('<footer'), 'blog shell');
const head = ({ title, desc, path, image, type = 'website', extra = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#F9F8F6">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Wellby">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${image}">
<link rel="alternate" type="application/rss+xml" title="Wellby blog" href="${SITE}/blog/rss.xml">
<link rel="icon" href="/favicon-32.png?v=3" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">
<link rel="preload" href="/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/v2.css">
${CSS}
${extra}
</head>
`;
const card = (p, h = 'h2', lazy = true) => `<li class="post-card"><a href="/blog/${p.slug}"><img src="/img/${p.art}-900.webp" srcset="/img/${p.art}-900.webp 900w, /img/${p.art}-1600.webp 1600w" sizes="(max-width: 700px) 100vw, 400px" width="1600" height="1200" alt=""${lazy ? ' loading="lazy"' : ''} decoding="async"><span class="pc-b"><span class="pc-tag">${p.tag}</span><${h}>${p.title}</${h}><span class="pc-p">${p.description}</span><span class="pc-meta">${fmt(p.date)} · ${p.minutes} min read</span></span></a></li>`;
await mkdir(`${D}/blog`, { recursive: true });
await mkdir(`${D}/img/og`, { recursive: true });
const posts = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
for (const p of posts) {
  // Share image per post: the cover art cropped to 1200x630.
  await writeFile(`${D}/img/og/${p.slug}.jpg`, await sharp(`${D}/img/${p.art}-1600.webp`).resize(1200, 630, { fit: 'cover', position: 'centre' }).flatten({ background: '#F9F8F6' }).jpeg({ quality: 84, progressive: true }).toBuffer());
  const image = `${SITE}/img/og/${p.slug}.jpg`, path = `/blog/${p.slug}`;
  const related = posts.filter(o => o.slug !== p.slug).slice(0, 3);
  const article = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BlogPosting', headline: p.title, description: p.description, datePublished: p.date, dateModified: p.date, image, url: SITE + path, mainEntityOfPage: SITE + path, author: { '@type': 'Organization', name: 'The Wellby team', url: SITE + '/' }, publisher: ORG, articleSection: p.tag, wordCount: strip(p.body).split(' ').length, inLanguage: 'en-US' },
    crumbs([['Home', '/'], ['Blog', '/blog'], [p.short, path]]),
  ] };
  const page = head({ title: (p.seo + ' | Wellby').length <= 60 ? p.seo + ' | Wellby' : p.seo, desc: p.description, path, image, type: 'article', extra: `<meta property="article:published_time" content="${p.date}">\n${ld(article)}` }) + top + `<main id="main" class="wrap doc">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a></nav>
  <p class="art-tag">${p.tag}</p>
  <h1>${p.title}</h1>
  <p class="doc-meta">By the Wellby team · <time datetime="${p.date}">${fmt(p.date)}</time> · ${p.minutes} min read</p>
  <figure class="art-cover"><img src="/img/${p.art}-1600.webp" srcset="/img/${p.art}-900.webp 900w, /img/${p.art}-1600.webp 1600w" sizes="(max-width: 800px) 100vw, 760px" width="1600" height="1200" alt="${esc(p.artAlt)}" fetchpriority="high"></figure>
  <aside class="takeaways" aria-label="Key takeaways"><h2>Key takeaways</h2><ul>${p.takeaways.map(t => `<li>${t}</li>`).join('')}</ul></aside>
  <article>${p.body}</article>
  <aside class="art-cta"><h2>Put this on autopilot</h2><p>Wellby is built to map every referral source around your offices, show your share of each one, and draft the follow-up for your team to approve. Start with a 14-day free trial.</p><a class="btn-cta" href="https://inroad-app.vercel.app/signup">Start free trial</a></aside>
  <section class="related" aria-labelledby="rel-h"><h2 id="rel-h">Keep reading</h2><ul class="blog-grid">${related.map(o => card(o, 'h3')).join('')}</ul></section>
</main>` + bottom;
  await write(`blog/${p.slug}.html`, page.replace(/\n{3,}/g, '\n\n'));
}
// Blog index.
{
  const desc = 'Practical guides for post-acute business development, sales and marketing teams: finding referral sources, measuring referral share, and outreach that works.';
  const graph = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Blog', name: 'Wellby blog', url: SITE + '/blog', description: desc, publisher: ORG, blogPost: posts.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE}/blog/${p.slug}`, datePublished: p.date })) },
    crumbs([['Home', '/'], ['Blog', '/blog']]),
  ] };
  const page = head({ title: 'Blog: Referral Marketing for Post-Acute Care | Wellby', desc, path: '/blog', image: `${SITE}/og.jpg?v=20261103e`, extra: ld(graph) }) + top + `<main id="main">
  <div class="wrap blog-head"><p class="eyebrow"><span>Blog</span></p><h1>Guides for teams <span class="pop">who bring in referrals.</span></h1><p>Practical playbooks for business development, sales and marketing teams in home health, hospice, home care and the rest of post-acute care.</p></div>
  <div class="wrap"><ul class="blog-grid">${posts.map((p, i) => card(p, 'h2', i > 2)).join('')}</ul></div>
</main>` + bottom;
  await write('blog/index.html', page);
  // RSS feed.
  await write('blog/rss.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Wellby blog</title><link>${SITE}/blog</link><description>${esc(desc)}</description><language>en-us</language>${posts.map(p => `<item><title>${esc(p.title)}</title><link>${SITE}/blog/${p.slug}</link><guid>${SITE}/blog/${p.slug}</guid><pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join('')}</channel></rss>\n`);
}
// Home: a "From the blog" row before the FAQ, for readers and internal links.
if (!html['index.html'].includes('id="home-blog"')) {
  const row = `<section class="sec home-blog" id="home-blog" aria-labelledby="hb-title">
  <div class="wrap">
    <div class="head center"><p class="eyebrow"><span>From the blog</span></p><h2 id="hb-title">Playbooks for <span class="pop">referral teams.</span></h2></div>
    <ul class="blog-grid">${posts.slice(0, 3).map(p => card(p, 'h3')).join('')}</ul>
    <p class="sp-more"><a href="/blog">Read all guides <span aria-hidden="true">→</span></a></p>
  </div>
</section>

`;
  must(html['index.html'].includes('<section class="sec" id="faq"'), 'faq anchor');
  html['index.html'] = html['index.html'].replace('<section class="sec" id="faq"', row + '<section class="sec" id="faq"');
}
for (const [f, h] of Object.entries(html)) await write(f, h);

// 5) Sitemap, robots and llms.txt.
const urls = ['/', '/pricing', '/specialties', '/blog', ...posts.map(p => `/blog/${p.slug}`), '/compare/trella', '/compare/definitive-healthcare', '/privacy'];
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}\n</urlset>\n`);
await write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
await write('llms.txt', `# Wellby\n\n> Wellby is referral intelligence plus a system of action for post-acute care (home health, hospice, skilled nursing, home care and more). It is built to map every referral source around a provider's offices, show the provider's share of each source's referrals, and draft the outreach and follow-up for the business development, sales and marketing team to approve. Wellby is in development with self-serve sign-up and a 14-day free trial.\n\n## Pages\n- [Home](${SITE}/): what Wellby does and how it works\n- [Specialties](${SITE}/specialties): the 18 kinds of referral-driven care Wellby is built for\n- [Pricing](${SITE}/pricing): plans and the free trial\n- [Wellby vs Trella Health](${SITE}/compare/trella)\n- [Wellby vs Definitive Healthcare](${SITE}/compare/definitive-healthcare)\n\n## Guides\n${posts.map(p => `- [${p.title}](${SITE}/blog/${p.slug}): ${p.description}`).join('\n')}\n`);
// 6) Contact: one shared address everywhere.
{
  const walk = async d => (await Promise.all((await readdir(d, { withFileTypes: true })).map(e => e.isDirectory() ? (e.name === 'img' || e.name === 'fonts' ? [] : walk(`${d}/${e.name}`)) : [`${d}/${e.name}`]))).flat();
  for (const f of (await walk(D)).filter(f => /\.(html|xml|txt)$/.test(f))) {
    const t = await readFile(f, 'utf8');
    const u = t.split('yaniv@wellbyhealth.com').join('team@wellbyhealth.com').split('Ask the founder').join('Ask our team').split('Email the founder').join('Email our team');
    if (u !== t) await writeFile(f, u);
  }
}
console.log(`site pass done: ${posts.length} posts, ${urls.length} sitemap URLs`);
