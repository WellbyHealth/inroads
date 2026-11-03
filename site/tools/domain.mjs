// After build.mjs: point every canonical, share and sitemap URL at the custom domain.
// App links (inroad-app.vercel.app) are left alone.
import { readFile, writeFile, readdir } from 'node:fs/promises';
const FROM = 'https://inroad-site.vercel.app', TO = 'https://wellbyinroads.com';
const walk = async d => (await Promise.all((await readdir(d, { withFileTypes: true })).map(e => e.isDirectory() ? (e.name === 'img' || e.name === 'fonts' ? [] : walk(`${d}/${e.name}`)) : [`${d}/${e.name}`]))).flat();
let n = 0;
for (const f of (await walk('dist')).filter(f => /\.(html|xml|txt)$/.test(f))) {
  const t = await readFile(f, 'utf8');
  if (t.includes(FROM) || t.includes('website at inroad-site.vercel.app')) { await writeFile(f, t.split(FROM).join(TO).split('website at inroad-site.vercel.app').join('website at wellbyinroads.com')); n++; }
}
if (!n) throw new Error('domain pass changed nothing');
console.log(`domain pass: ${n} files now use ${TO}`);
