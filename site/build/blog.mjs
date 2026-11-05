#!/usr/bin/env node
// Blog build (kept outside tools/ because tools/ is not uploaded to Vercel) for the Wellby marketing site. Dependency free.
//
//   node build/blog.mjs                 build (runs on every Vercel deploy)
//   node build/blog.mjs --check         strict validation of every post, including future ones
//   node build/blog.mjs --today=2026-12-01   build as if it were that date (testing)
//
// Source posts live in content/blog/posts/*.md. A post is published only when its
// date is today or earlier (US Pacific time). Unpublished posts never appear in a
// page, the index, the home page strip, the sitemap, the RSS feed or llms.txt.
// Five older hand-written posts are listed in content/blog/legacy.json and are
// never regenerated.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUB = path.join(ROOT, 'public');
const CONTENT = path.join(ROOT, 'content', 'blog');
const SITE = 'https://wellbyinroads.com';
const BRAND = 'Wellby';
const AUTHOR = 'The Wellby team';
const PUBLISHER = 'Wellby Health';
const SIGNUP = 'https://app.wellbyinroads.com/signup';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const todayArg = (args.find((a) => a.startsWith('--today=')) || '').split('=')[1];
const TODAY = todayArg || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

const read = (p) => fs.readFileSync(p, 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${dd}, ${y}`; };
const rfc822 = (d) => new Date(`${d}T12:00:00Z`).toUTCString();

// ---------- art ----------
const ART_ALT = {
  compare: 'Clay illustration of a stack of dusty dashboards beside a flower pot sending out notes.',
  desk: 'Clay illustration of a desk buried in referral paperwork, sticky notes and a ringing phone.',
  garden: 'Clay illustration of a garden of terracotta pots with seedlings growing.',
  garden2: 'Clay illustration of a shelf of terracotta pots with seedlings growing into bloom.',
  'how-prove': 'Clay illustration of a bar chart, an inbox of hearts and a small trophy.',
  'how-target': 'Clay illustration of a map tile with buildings and a magnifying glass.',
  'how-win': 'Clay illustration of a laptop sending an envelope to a doctor’s office, with a car and coffee.',
  intake: 'Clay illustration of envelopes sorting themselves into an inbox tray.',
  marketer: 'Clay illustration of a car driving a pinned route toward a hospital.',
  owner: 'Clay illustration of an owner’s desk with a growing bar chart and a flower in bloom.',
  why: 'Clay illustration of a pile of dusty dashboards beside a flower pot sending out notes.',
  faq: 'Clay illustration of a question mark and a speech bubble on a small desk.',
};
const altFor = (stem) => ART_ALT[stem] || `Clay illustration for ${stem.replace(/^sp-/, '').replace(/-/g, ' ')}.`;

// ---------- load content ----------
const legacy = JSON.parse(read(path.join(CONTENT, 'legacy.json')));

function parseFront(src, file) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const li = line.match(/^\s+-\s+(.*)$/);
    if (li && key) { meta[key].push(li[1].trim()); continue; }
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    meta[key] = kv[2] === '' ? [] : kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: m[2].trim() };
}

// ---------- tiny markdown ----------
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}
const slugify = (s) => s.toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function render(body) {
  const lines = body.split('\n');
  const out = []; const toc = []; const used = new Set();
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^## (.+)$/))) {
      let id = slugify(m[1]); let n = 2; while (used.has(id)) id = `${slugify(m[1])}-${n++}`; used.add(id);
      toc.push({ id, text: m[1] });
      out.push(`<h2 id="${id}">${inline(m[1])}</h2>`); i++; continue;
    }
    if ((m = l.match(/^### (.+)$/))) { out.push(`<h3>${inline(m[1])}</h3>`); i++; continue; }
    if (/^- /.test(l)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) { items.push(`<li>${inline(lines[i].slice(2))}</li>`); i++; }
      out.push(`<ul>${items.join('')}</ul>`); continue;
    }
    if (/^\d+\. /.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`); i++; }
      out.push(`<ol>${items.join('')}</ol>`); continue;
    }
    if (/^> ?/.test(l)) {
      const q = [];
      while (i < lines.length && /^> ?/.test(lines[i])) { q.push(lines[i].replace(/^> ?/, '')); i++; }
      const paras = q.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      const first = paras[0] || '';
      const label = first.match(/^\*\*([^*]+)\*\*\s*/);
      const head = label ? `<p class="ex-h">${esc(label[1])}</p>` : '';
      const rest = label ? [first.slice(label[0].length), ...paras.slice(1)].filter(Boolean) : paras;
      const html = rest.map((p) => (/^- /.test(p) ? `<ul>${p.split('\n').map((x) => `<li>${inline(x.replace(/^- /, ''))}</li>`).join('')}</ul>` : `<p>${inline(p.replace(/\n/g, ' '))}</p>`)).join('');
      out.push(`<aside class="ex">${head}${html}</aside>`); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3} |- |\d+\. |> ?)/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { html: out.join('\n'), toc };
}

// ---------- validation ----------
const BANNED = ['delve', 'landscape', 'seamless', 'robust', 'unlock', 'in conclusion', 'leverage', 'game-changer', 'game changer', 'tapestry', 'ever-evolving', 'in today’s', "in today's", 'it’s important to note', "it's important to note", 'furthermore', 'moreover', 'elevate', 'streamline', 'cutting-edge', 'holistic', 'synergy', 'testament to', 'navigate the', 'realm of', 'dive into', 'deep dive'];
const CLAIMS = ['studies show', 'research shows', 'research suggests', 'according to', 'on average', 'survey', 'benchmark', 'industry standard', 'experts say', 'statistics'];
const plain = (s) => s.replace(/\*\*|\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const wordsOf = (s) => (plain(s).match(/[A-Za-z0-9$%][A-Za-z0-9$%'’.,-]*/g) || []).length;
const sentences = (s) => plain(s).split(/(?<=[.!?])\s+/);

function internalTargets() {
  const ids = {};
  const pages = { '/': 'index.html', '/pricing': 'pricing.html', '/specialties': 'specialties.html', '/blog': 'blog/index.html', '/compare/trella': 'compare/trella.html', '/compare/definitive-healthcare': 'compare/definitive-healthcare.html', '/privacy': 'privacy.html' };
  for (const [u, f] of Object.entries(pages)) { const p = path.join(PUB, f); if (fs.existsSync(p)) ids[u] = new Set([...read(p).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])); }
  return ids;
}

function validate(post, ctx) {
  const e = []; const w = [];
  const { meta, body } = post;
  for (const k of ['title', 'slug', 'date', 'description', 'tag', 'art', 'keyphrase']) if (!meta[k]) e.push(`missing ${k}`);
  if (!Array.isArray(meta.takeaways) || meta.takeaways.length < 2) e.push('needs 2 to 3 takeaways');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '')) e.push('bad date');
  if (meta.slug && !/^[a-z0-9-]+$/.test(meta.slug)) e.push('bad slug');
  if (ctx.slugs.has(meta.slug)) e.push('duplicate slug');
  ctx.slugs.add(meta.slug);
  if ((meta.description || '').length > 155) e.push(`description ${meta.description.length} chars (max 155)`);
  if ((meta.title || '').length > 70) w.push(`title ${meta.title.length} chars`);
  const all = [meta.title, meta.description, ...(meta.takeaways || []), body].join('\n');
  if (/[–—―−]/.test(all)) e.push('contains an en dash or em dash');
  if (/\w -{1,2} \w/.test(body)) w.push('spaced hyphen used like a dash');
  const low = all.toLowerCase();
  for (const b of BANNED) if (new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(low)) e.push(`banned phrase: ${b}`);
  for (const c of CLAIMS) if (low.includes(c)) e.push(`unsupported claim phrase: ${c}`);
  // numbers with % only inside illustrative blocks
  const outside = body.split('\n').filter((l) => !/^> ?/.test(l)).join('\n');
  if (/%|\bpercent\b/i.test(outside)) e.push('percentage outside a labeled illustrative example');
  const words = wordsOf(body);
  if (words < 700 || words > 1000) e.push(`${words} words (need 700 to 1000)`);
  const kp = (meta.keyphrase || '').toLowerCase();
  if (kp) {
    if (!(meta.title || '').toLowerCase().includes(kp)) e.push('keyphrase not in title');
    const firstPara = body.split(/\n\s*\n/)[0];
    if (!sentences(firstPara).slice(0, 2).join(' ').toLowerCase().includes(kp)) e.push('keyphrase not in first two sentences');
    if (!/^## .*$/m.test(body) || !body.split('\n').some((l) => /^## /.test(l) && l.toLowerCase().includes(kp))) e.push('keyphrase not in any H2');
  }
  const h2 = body.split('\n').filter((l) => /^## /.test(l));
  if (h2.length < 4) e.push(`only ${h2.length} H2 sections`);
  if (!body.split('\n').some((l) => /^> \*\*Illustrative/i.test(l))) w.push('no labeled illustrative example');
  // links
  const links = [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((m) => m[1]);
  if (links.length < 2 || links.length > 3) e.push(`${links.length} links (need 2 to 3)`);
  for (const u of links) {
    const [p, h] = u.split('#');
    const set = ctx.targets[p || '/'];
    if (!set) { e.push(`link target not found: ${u}`); continue; }
    if (h && !set.has(h)) e.push(`link anchor not found: ${u}`);
  }
  // brand mention only in the last paragraph
  const paras = body.split(/\n\s*\n/);
  const last = paras[paras.length - 1];
  const before = paras.slice(0, -1).join('\n') + '\n' + (meta.takeaways || []).join('\n');
  if (!new RegExp(BRAND).test(last)) e.push(`last paragraph must softly mention ${BRAND}`);
  if (new RegExp(BRAND).test(before.replace(/\]\([^)]*\)/g, ''))) e.push(`${BRAND} mentioned before the closing paragraph`);
  if ((last.match(new RegExp(BRAND, 'g')) || []).length > 2) w.push('closing paragraph mentions the brand more than twice');
  if (/^(#{2,3} |- |> |\d+\. )/.test(last)) e.push('closing paragraph must be plain prose');
  if (!fs.existsSync(path.join(PUB, 'img', `g-art-${meta.art}-1600.webp`))) e.push(`art not found: g-art-${meta.art}-1600.webp`);
  return { e, w, words };
}

// ---------- load posts ----------
function loadPosts() {
  const dir = path.join(CONTENT, 'posts');
  if (!fs.existsSync(dir)) return [];
  const ctx = { slugs: new Set(legacy.map((p) => p.slug)), targets: internalTargets() };
  const posts = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    try {
      const post = parseFront(read(path.join(dir, f)), f);
      post.file = f;
      post.check = validate(post, ctx);
      post.meta.minutes = Math.max(3, Math.round(post.check.words / 220));
      posts.push(post);
    } catch (err) {
      posts.push({ file: f, meta: { slug: f }, body: '', check: { e: [err.message], w: [], words: 0 } });
    }
  }
  return posts;
}

const posts = loadPosts();
if (CHECK) {
  let bad = 0;
  for (const p of posts) {
    const { e, w, words } = p.check;
    if (e.length || w.length) console.log(`${p.file} (${words} words)\n${e.map((x) => '  ERROR ' + x).join('\n')}${e.length && w.length ? '\n' : ''}${w.map((x) => '  warn  ' + x).join('\n')}`);
    if (e.length) bad++;
  }
  const dates = posts.map((p) => p.meta.date).filter(Boolean);
  for (let i = 1; i < dates.length; i++) {
    const gap = (new Date(dates[i]) - new Date(dates[i - 1])) / 864e5;
    if (gap !== 3) { console.log(`date gap ${dates[i - 1]} -> ${dates[i]} is ${gap} days`); bad++; }
  }
  console.log(`${posts.length} posts checked, ${bad} with problems`);
  process.exit(bad ? 1 : 0);
}

// Only valid posts whose date has arrived are published. A broken post is skipped, never fatal.
const published = posts.filter((p) => {
  if (p.check.e.length) { console.warn(`skip ${p.file}: ${p.check.e.join('; ')}`); return false; }
  return p.meta.date <= TODAY;
}).map((p) => {
  const { html, toc } = render(p.body);
  return { ...p.meta, html, toc, words: p.check.words, kind: 'new' };
});
const all = [...legacy.map((p) => ({ ...p, kind: 'legacy' })), ...published].sort((a, b) => (a.date === b.date ? (a.kind === 'new' ? -1 : 1) : b.date.localeCompare(a.date)));

// ---------- shared template pieces ----------
const shell = read(path.join(PUB, 'blog', legacy[0].slug + '.html'));
const styleLinks = [...shell.matchAll(/<link rel="stylesheet"[^>]*>/g)].map((m) => m[0]).join('\n');
const navScript = (shell.match(/<script src="\/nav\.js[^>]*><\/script>/) || [''])[0];
const header = shell.match(/<header class="hdr">[\s\S]*?<\/header>/)[0];
const footer = shell.match(/<footer class="foot">[\s\S]*?<\/footer>/)[0];
const iconLinks = '<link rel="icon" href="/favicon-32.png?v=3" sizes="32x32" type="image/png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">\n<link rel="preload" href="/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>';

const url = (slug) => `${SITE}/blog/${slug}`;
const ogImage = (p) => (p.kind === 'legacy' || fs.existsSync(path.join(CONTENT, 'og', `${p.slug}.jpg`)) ? `${SITE}/img/og/${p.slug}.jpg` : `${SITE}/og.jpg`);

function card(p, tag = 'h3', lazy = true) {
  const art = `/img/g-art-${p.art}`;
  return `<li class="post-card"><a href="/blog/${p.slug}"><img src="${art}-900.webp" srcset="${art}-900.webp 900w, ${art}-1600.webp 1600w" sizes="(max-width: 700px) 100vw, 400px" width="1600" height="1200" alt=""${lazy ? ' loading="lazy"' : ''} decoding="async"><span class="pc-b"><span class="pc-tag">${esc(p.tag)}</span><${tag}>${esc(p.title)}</${tag}><span class="pc-p">${esc(p.description)}</span><span class="pc-meta">${longDate(p.date)} · ${p.minutes} min read</span></span></a></li>`;
}

function related(p) {
  const others = all.filter((x) => x.slug !== p.slug);
  const same = others.filter((x) => x.tag === p.tag);
  const rest = others.filter((x) => x.tag !== p.tag);
  // newest-first within tag, then nearest in time for the rest
  const near = rest.sort((a, b) => Math.abs(new Date(a.date) - new Date(p.date)) - Math.abs(new Date(b.date) - new Date(p.date)));
  return [...same, ...near].slice(0, 3);
}

function postPage(p) {
  const u = url(p.slug);
  const img = ogImage(p);
  const title = `${p.title} | ${BRAND}`;
  const art = `/img/g-art-${p.art}`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BlogPosting', headline: p.title, description: p.description, datePublished: p.date, dateModified: p.date, image: img, url: u, mainEntityOfPage: u, author: { '@type': 'Organization', name: AUTHOR, url: `${SITE}/` }, publisher: { '@type': 'Organization', name: PUBLISHER, url: `${SITE}/`, logo: `${SITE}/icon-512.png`, email: 'team@wellbyhealth.com' }, articleSection: p.tag, keywords: p.keyphrase, wordCount: p.words, inLanguage: 'en-US' },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` }, { '@type': 'ListItem', position: 3, name: p.title, item: u }] },
    ],
  };
  const toc = p.toc.length >= 3 ? `<nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h">In this post</h2><ol>${p.toc.map((t) => `<li><a href="#${t.id}">${inline(t.text)}</a></li>`).join('')}</ol></nav>` : '';
  const rel = related(p).map((x) => card(x)).join('');
  const alt = altFor(p.art);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(p.description)}">
<meta name="theme-color" content="#F9F8F6">
<link rel="canonical" href="${u}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(p.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${esc(p.title)}">
<link rel="alternate" type="application/rss+xml" title="${BRAND} blog" href="${SITE}/blog/rss.xml">
${iconLinks}
${styleLinks}
<meta property="article:published_time" content="${p.date}">
<meta property="article:section" content="${esc(p.tag)}">
<script type="application/ld+json">${jsonLd(ld)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header}
<main id="main" class="wrap doc">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a></nav>
  <p class="art-tag">${esc(p.tag)}</p>
  <h1>${esc(p.title)}</h1>
  <p class="doc-meta">By ${AUTHOR} · <time datetime="${p.date}">${longDate(p.date)}</time> · ${p.minutes} min read</p>
  <figure class="art-cover"><img src="${art}-1600.webp" srcset="${art}-900.webp 900w, ${art}-1600.webp 1600w" sizes="(max-width: 800px) 100vw, 760px" width="1600" height="1200" alt="${esc(alt)}" fetchpriority="high"></figure>
  <aside class="takeaways" aria-label="Key takeaways"><h2>Key takeaways</h2><ul>${p.takeaways.map((t) => `<li>${inline(t)}</li>`).join('')}</ul></aside>
  ${toc}
  <article>
${p.html}
</article>
  <aside class="art-cta"><h2>Put this on autopilot</h2><p>${BRAND} is built to map every referral source around your offices, show your share of each one, and draft the follow-up for your team to approve. Start with a 14-day free trial.</p><a class="btn-cta" href="${SIGNUP}">Start free trial</a></aside>
  <section class="related" aria-labelledby="rel-h"><h2 id="rel-h">Keep reading</h2><ul class="blog-grid">${rel}</ul></section>
</main>
${footer}
${navScript}
</body>
</html>
`;
}

// ---------- write posts ----------
const blogDir = path.join(PUB, 'blog');
const publishedSlugs = new Set(published.map((p) => p.slug));
for (const p of published) fs.writeFileSync(path.join(blogDir, `${p.slug}.html`), postPage(p));
// remove pages of posts that are not due (or no longer valid)
for (const p of posts) {
  const slug = p.meta.slug;
  if (slug && !publishedSlugs.has(slug) && !legacy.some((l) => l.slug === slug)) {
    for (const f of [path.join(blogDir, `${slug}.html`), path.join(PUB, 'img', 'og', `${slug}.jpg`)]) if (fs.existsSync(f)) fs.rmSync(f);
  }
}
// share images for published posts
fs.mkdirSync(path.join(PUB, 'img', 'og'), { recursive: true });
for (const p of published) {
  const src = path.join(CONTENT, 'og', `${p.slug}.jpg`);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(PUB, 'img', 'og', `${p.slug}.jpg`));
}

// ---------- index ----------
{
  const f = path.join(blogDir, 'index.html');
  let s = read(f);
  const grid = all.map((p, i) => card(p, 'h2', i > 2)).join('');
  s = s.replace(/(<div class="wrap"><ul class="blog-grid">)[\s\S]*?(<\/ul><\/div>\s*<\/main>)/, `$1${grid}$2`);
  // JSON-LD blogPost list
  s = s.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (m, j) => {
    try {
      const d = JSON.parse(j);
      const blog = d['@graph'].find((n) => n['@type'] === 'Blog');
      if (blog) blog.blogPost = all.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: url(p.slug), datePublished: p.date, image: ogImage(p), description: p.description }));
      return `<script type="application/ld+json">${jsonLd(d)}</script>`;
    } catch { return m; }
  });
  fs.writeFileSync(f, s);
}

// ---------- home strip (latest three) ----------
{
  const f = path.join(PUB, 'index.html');
  let s = read(f);
  const latest = all.slice(0, 3).map((p) => card(p, 'h3')).join('');
  s = s.replace(/(<section class="sec home-blog"[\s\S]*?<ul class="blog-grid">)[\s\S]*?(<\/ul>)/, `$1${latest}$2`);
  fs.writeFileSync(f, s);
}

// ---------- RSS ----------
{
  const items = all.map((p) => `<item><title>${esc(p.title)}</title><link>${url(p.slug)}</link><guid>${url(p.slug)}</guid><pubDate>${rfc822(p.date)}</pubDate><category>${esc(p.tag)}</category><description>${esc(p.description)}</description></item>`).join('');
  fs.writeFileSync(path.join(blogDir, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${BRAND} blog</title><link>${SITE}/blog</link><atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml"/><description>Practical guides for referral-driven care teams: tracking referrals, managing referral sources, and measuring what outreach wins.</description><language>en-us</language><lastBuildDate>${rfc822(all[0].date)}</lastBuildDate>${items}</channel></rss>\n`);
}

// ---------- sitemap ----------
{
  const f = path.join(PUB, 'sitemap.xml');
  const s = read(f);
  const keep = [...s.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)].filter((m) => !m[1].startsWith(`${SITE}/blog`));
  const rows = keep.map((m) => `  <url><loc>${m[1]}</loc><lastmod>${m[2]}</lastmod></url>`);
  rows.push(`  <url><loc>${SITE}/blog</loc><lastmod>${all[0].date}</lastmod></url>`);
  for (const p of all) rows.push(`  <url><loc>${url(p.slug)}</loc><lastmod>${p.date}</lastmod></url>`);
  fs.writeFileSync(f, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`);
}

// ---------- llms.txt guides ----------
{
  const f = path.join(PUB, 'llms.txt');
  const s = read(f);
  const guides = all.map((p) => `- [${p.title}](${url(p.slug)}): ${p.description}`).join('\n');
  const next = s.replace(/## Guides\n[\s\S]*$/, `## Guides\n${guides}\n`);
  fs.writeFileSync(f, next);
}

console.log(`blog: ${all.length} published (${published.length} new), ${posts.length - published.length} waiting, today ${TODAY}`);
