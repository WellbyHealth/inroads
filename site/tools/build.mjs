// Build step: copy the static site into dist/ and produce optimized WebP art from the
// original FLORA renders (public URLs), plus the Open Graph card. Runs on Vercel.
import sharp from 'sharp';
import { mkdir, copyFile, readFile, writeFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SOURCES = [
  ["scene", "scorecard", "https://media.flora.ai/node-inputs/2026/11/2/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m176a89cpk4a8csv7krrspcazs8hfc4d-0.png"],
  ["scene", "laptop", "https://media.flora.ai/node-inputs/2026/11/2/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17ap1cmmrybgsqwwc4p08e2p18hexcc-0.png"],
  ["scene", "map", "https://media.flora.ai/node-inputs/2026/11/2/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m173w3vb00aphvmvk1bb71kbpx8heqdg-0.png"],
  ["cut", "hospital", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/be6cec0c-75fc-40c4-bb36-4773863bc9cb.png"],
  ["cut", "rehab", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/8a1c939d-640e-4e8e-9f95-eba2f8f8d8f2.png"],
  ["cut", "nursing", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/83831a0c-f1c6-498d-843e-0546953be8de.png"],
  ["cut", "office", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/351e10ec-d40a-410d-8c24-da005bec40ed.png"],
  ["cut", "clipboard", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/2e9c259d-958a-4a09-927d-e4aef7a053ab.png"],
  ["cut", "house", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/1b484058-220c-4d9d-bdc9-ffbd1994f5fc.png"],
  ["cut", "envelope", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/316e5f7a-8770-4700-81bb-58f793317d77.png"],
  ["pano", "hero-pot", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17b2zd460m3emnjkqy60qpnjd8hgywn-0.png"],
  ["balls", "ball", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/6a5f9baf-085f-45d3-a1f5-961b8a15bf0e.png"],
  ["cut", "stk-score", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/a8f1f118-e670-48e5-8e5a-77d246a0df73.png"],
  ["cut", "stk-grow", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/f1d21d85-bdce-4a23-871b-786a72644024.png"],
  ["cut", "stk-reconnect", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/cde3fe56-d762-4285-94de-f5f0a9d0e638.png"],
  ["cut", "stk-plan", "https://media.flora.ai/node-inputs/2026/11/2/anonymous/6d892bfe-1b62-4c7d-ad2c-b0b3d85a109b.png"],
  ["cut", "stk-market", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/e5c2e296-ab27-4394-845b-6b81e4509622.png"],
  ["cut", "sp-home-care", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/c795ee47-0ebe-4cdc-beaf-4dcaa8c4c59d.png"],
  ["cut", "sp-home-health", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/7a23de7b-2900-414d-8503-5168eec86c02.png"],
  ["cut", "sp-home-infusion", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/ac31b2cd-8c75-4d2c-86ca-74a2a79919b7.png"],
  ["cut", "sp-hospice", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/4c19a674-ebd4-4ba5-b4e3-bd576a41ed15.png"],
  ["cut", "sp-palliative", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/7904a28d-6971-4bbe-a39b-993fc7bb9c57.png"],
  ["cut", "sp-assisted-living", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/c4327f2a-36df-4c9b-843b-c3580f0044cb.png"],
  ["cut", "sp-memory-care", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/903e9792-8e2f-43e6-8122-03e6be5d082b.png"],
  ["cut", "sp-skilled-nursing", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/6627b228-72c8-4bca-824a-f6ea64fe5d90.png"],
  ["cut", "sp-behavioral-health", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/b3f80cae-71ae-496a-be27-ef52b88cc52d.png"],
  ["cut", "sp-addiction", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/1b97a6df-e8d0-4b79-8ad7-28fda0a44669.png"],
  ["cut", "sp-eating-disorders", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/fb72a2ba-087f-4c08-a82c-e16231f372ef.png"],
  ["cut", "sp-pediatric", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/a7271ed6-6301-489b-9808-d9301e0e52c6.png"],
  ["cut", "sp-physical-therapy", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/3999508b-6859-47f6-b07c-d7131f1d4565.png"],
  ["cut", "sp-aba", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/2d95ed7f-08f5-41ac-a85c-d78860c5fff9.png"],
  ["cut", "sp-dialysis", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/d437ea76-06a7-4aaa-a3ce-30db645fddd8.png"],
  ["cut", "sp-dme", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/16c6952d-130e-422a-9d1e-63e31e665ae4.png"],
  ["cut", "sp-wound-care", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/1be5db82-76ee-4eeb-995d-40255160ab77.png"],
  ["cut", "sp-adult-day", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/546b3211-8f7b-4ae7-a85a-f091faea2bcd.png"],
  ["art", "art-desk", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m178ye6k3w1ycdtn6d3qe68g018hh7xp-0.png"],
  ["art", "art-owner", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17awn0g6cvmdexddjesmt037n8hhk3p-0.png"],
  ["art", "art-marketer", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m171dzmvxvfzqtdeknqp9ebdt98hhkbz-0.png"],
  ["art", "art-intake", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m170cx1h2ewahkpzt39bgg73qn8hgq25-0.png"],
  ["art", "art-why", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17erh8s3n7dd0xamyn46a2kpx8hhnb5-0.png"],
  ["art", "art-garden", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17890whvse03a55g8gw5zc4nn8hg2mc-0.png"],
  ["art", "art-compare", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17dnwn7b8zspds7kqefncmddn8hgyw9-0.png"],
  ["art", "art-faq", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m170ems39sn0zxnphkc01yzd8h8hhnx3-0.png"],
  ["art", "art-sp-home-health", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17cak5kxzpmhn0s71kfc8qz618hg4dt-0.png"],
  ["art", "art-sp-hospice", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m171w21mszqfh9prcwn60mtqn98hgaap-0.png"],
  ["art", "art-sp-skilled-nursing", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17a2bj3v9yj1snam8beeys7cn8hg5gy-0.png"],
  ["art", "art-sp-home-care", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m174v1garahn4tg637k6505zns8hhad0-0.png"],
  ["art", "art-sp-physical-therapy", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17dr06tsr8rb0f6qf35w1yyk18hgd66-0.png"],
  ["art", "art-sp-home-infusion", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17acd65em397w723t3k4m0vqd8hhmsg-0.png"],
  ["art", "art-sp-palliative", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m171krq6d7pwqs7mwjjsema3bx8hgh0v-0.png"],
  ["art", "art-sp-dme", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m1799drqd9pfyr5w54h204pvnn8hhbz9-0.png"],
  ["art", "art-sp-wound-care", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m171bs8c44b5pv0rxwz61mbpnd8hhwmh-0.png"],
  ["art", "art-sp-dialysis", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m176gz34f9hpmbesyg0vn3c2118hhcgf-0.png"],
  ["art", "art-sp-assisted-living", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17b02xe822kvd91w1v805m3bd8hgrkc-0.png"],
  ["art", "art-sp-memory-care", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17d7m6pdpt71metyz87y7hpy98hh63z-0.png"],
  ["art", "art-sp-adult-day", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m178ajd00h38na2vvzqrtktre98hg45w-0.png"],
  ["art", "art-sp-behavioral-health", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17a0myr28q0yv3q37sdrga19d8hg25b-0.png"],
  ["art", "art-sp-addiction", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m171cv2kvwg8v8jhgcyn9178h18hhczw-0.png"],
  ["art", "art-sp-eating-disorders", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m1795z2tk2v62htv8cfgnyam6s8hgztr-0.png"],
  ["art", "art-sp-aba", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17dr6z5sze4k5f57h4dwrwfss8hhgvs-0.png"],
  ["art", "art-sp-pediatric", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m175ezpy69kwscwnb6sqj25x5x8hgc57-0.png"],
  ["wide", "hero-route", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17ajk1k3j4pa02sqrvsbh65358hg3k8-0.png"],
  ["art", "hero-route-tall", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m1760twmbpf4wtdmf983yxjcen8hgq65-0.png"],
  ["wide", "hero-ring", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17aa2k55y4ptytexxp37p25an8hgpc7-0.png"],
  ["art", "hero-ring-tall", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17b6984agk5zz6bvqh72c5eyx8hhp10-0.png"],
  ["wide", "hero-side", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17dafb7ttt7knmqqwhvtmxhtn8hhe0p-0.png"],
  ["art", "hero-side-tall", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m176cq5wb7sjh00ebwgj6typt58hh376-0.png"],
  ["wide", "hero-desk", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17079fmw6tg9df31jqvxwpej98hhw62-0.png"],
  ["art", "hero-desk-tall", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17e7br276krzdx5qcx25nyb8x8hhdqm-0.png"],
  ["cut", "car-top", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/2e43de47-adc3-4751-8bf9-11ebea480518.png"],
  ["cut", "car", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/1a51dd8b-c3cc-45d0-b5c3-2f5fd77382ee.png"],
  ["cut", "cl-logo", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/20c5618e-a20e-45f7-95d5-ca811fc6aa33.png"],
  ["cut", "cl-hospital", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/1cea9242-8cb8-4802-b545-d68e856a407e.png"],
  ["cut", "cl-office", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/01ebc365-6fec-4586-9d23-8b8aedb029d8.png"],
  ["cut", "cl-nursing", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/12ec410e-1484-4521-b054-a3a750a9847b.png"],
  ["cut", "cl-rehab", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/c1bd51cf-121e-478f-819f-33b2dddd6a31.png"],
  ["cut", "cl-clipboard", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/2238f4e1-4bf0-40fa-9e3a-ba0b98d96fc0.png"],
  ["cut", "cl-house", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/22a3d371-aca0-4f26-9452-0754452b1950.png"],
  ["cut", "cl-car", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/ac2c6a62-369d-4fda-9f38-06411785f523.png"],
  ["cut", "cl-coffee", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/7fe3e1d4-e77f-4b72-9b03-9b3e7dfcb686.png"],
  ["cut", "cl-envelope", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/20f00ebd-cc51-41f4-8791-4ee07d424b02.png"],
  ["cut", "cl-phone", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/01beffd9-f36d-444d-b8e1-f1e1cf075f88.png"],
  ["cut", "cl-calendar", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/06b912fe-d70e-485d-a5e2-735ad385ab6f.png"],
  ["wide", "hero-desk2", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m1740q7g61k88xdg78vr8k4pth8hhk8b-0.png"],
  ["art", "hero-desk2-tall", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m175mwcsky2kaa4kh9m94zs9gx8hh0jy-0.png"],
  ["art", "art-how-target", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m171kbyfben56mqw99sbkevad18hh5pe-0.png"],
  ["art", "art-how-win", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17aykqd3cxqkjf8ef6a81ran18hgq9z-0.png"],
  ["art", "art-how-prove", "https://media.flora.ai/node-inputs/2026/11/3/px7f8y72vp0w6y64bac1g7tfp58gtdrb/gen-m17dwy98q75321zfyny7z0dba98hhvh1-0.png"],
  ["cut", "tier-seed", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/fed6ffe0-f28e-4631-924a-38661da7e59f.png"],
  ["cut", "tier-bloom", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/46c8930d-25b4-400a-a203-bc91d1e21a70.png"],
  ["cut", "tier-house", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/58f26bb9-711c-4b72-a064-631717689074.png"],
  ["cut", "tr-shield", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/608eb5b0-d97b-416a-b27e-0fea5b9b9e06.png"],
  ["cut", "tr-read", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/5aee2c91-b1c0-4612-98b0-18725c8d7b7e.png"],
  ["cut", "tr-send", "https://media.flora.ai/node-inputs/2026/11/3/anonymous/de411850-2a83-4a57-8b37-3bfb5775c8d1.png"]
];
const OUT = 'dist';
await mkdir(`${OUT}/img`, { recursive: true });
await mkdir(`${OUT}/fonts`, { recursive: true });
for (const f of ["index.html", "privacy.html", "specialties.html", "pricing.html", "styles.css", "v2.css", "hero.js", "main.js", "nav.js", "sp.js", "favicon.svg", "robots.txt", "sitemap.xml", "404.html"]) if (existsSync(f)) await copyFile(f, `${OUT}/${f}`);
if (existsSync('compare')) await cp('compare', `${OUT}/compare`, { recursive: true });
// Clay pass (Nov 3): new desk hero with visits/coffee/calls, clay icons, clay how-it-works art.
// Applied to the copied files so the source pages can be referenced unchanged; every step is idempotent.
{
  const rep = (t, a, b) => t.split(a).join(b);
  let h = await readFile(`${OUT}/index.html`, 'utf8');
  h = rep(h, 'g-hero-desk-', 'g-hero-desk2-');
  h = rep(h, 'og.jpg?v=20261103d', 'og.jpg?v=20261103e');
  h = rep(h, "Illustrated clay desk sending envelopes to a hospital, a doctor's office and a nursing facility, with referrals coming back", "Illustrated clay desk reaching a hospital, a doctor's office and a nursing facility by car visit, coffee, calls and email");
  h = rep(h, "Envelopes fly from the screen to a hospital, a doctor's office and a nursing facility floating on clouds, while referral cards and hearts drift back into an inbox tray beside a rising bar chart.", "Outreach goes out to a hospital, a doctor's office and a nursing facility floating on clouds: a car drives a little road to a visit, coffee cups clink, a phone rings and envelopes fly, beside an inbox tray and a rising bar chart.");
  const seq = ['cl-phone', 'cl-coffee', 'cl-envelope', 'cl-calendar', 'cl-envelope'];
  h = h.replace(/<svg class="hero-anim[\s\S]*?<\/svg>/g, svg => { let k = 0; return svg.replace(/\/img\/g-envelope-cut\.webp/g, () => `/img/g-${seq[k++ % seq.length]}-cut.webp`); });
  for (const n of ['hospital', 'clipboard', 'nursing', 'rehab', 'house', 'envelope']) h = rep(h, `/img/g-${n}-cut.webp`, `/img/g-cl-${n}-cut.webp`);
  for (const [o, n] of [['g-map-600.webp', 'target'], ['g-laptop-600.webp', 'win'], ['g-scorecard-600.webp', 'prove']])
    h = rep(h, `<img src="/img/${o}" width="600" height="750" alt=""`, `<img src="/img/g-art-how-${n}-900.webp" srcset="/img/g-art-how-${n}-900.webp 900w, /img/g-art-how-${n}-1600.webp 1600w" sizes="(max-width: 820px) 100vw, 400px" width="1600" height="1200" alt=""`);
  if (!h.includes('line up the visits')) h = rep(h, 'Agents draft the thank-yous, check-ins and updates, and follow up until partners reply.', 'Agents draft the thank-yous, check-ins and updates, line up the visits, and follow up until partners reply.');
  await writeFile(`${OUT}/index.html`, h);
  let m = await readFile(`${OUT}/main.js`, 'utf8');
  m = rep(m, '/img/g-${', '/img/g-cl-${'); m = rep(m, '/img/g-cl-cl-', '/img/g-cl-'); m = rep(m, '/img/g-house-cut.webp', '/img/g-cl-house-cut.webp');
  await writeFile(`${OUT}/main.js`, m);
  let j = await readFile(`${OUT}/hero.js`, 'utf8');
  for (const n of ['hospital', 'office', 'rehab']) j = rep(j, `/img/g-${n}-cut.webp`, `/img/g-cl-${n}-cut.webp`);
  await writeFile(`${OUT}/hero.js`, j);
  // Stop the build (and keep the live site) if any swap missed.
  const miss = [[h, 'g-hero-desk2-'], [h, 'g-cl-coffee'], [h, 'g-art-how-win'], [m, '/img/g-cl-${'], [m, 'g-cl-house'], [j, 'g-cl-hospital']].filter(([t, k]) => !t.includes(k)).map(([, k]) => k);
  if (miss.length) throw new Error('clay pass missed: ' + miss.join(', '));
}
// Logo: the clay flower head. Swap any inline SVG mark in the copied pages for the clay image.
{
  const CLAY = '<img class="mark" src="/img/g-cl-logo-96.webp" width="30" height="30" alt="">';
  for (const f of ['index.html', 'privacy.html', 'specialties.html', 'pricing.html', '404.html', 'compare/trella.html', 'compare/definitive-healthcare.html']) {
    if (!existsSync(`${OUT}/${f}`)) continue;
    const html = await readFile(`${OUT}/${f}`, 'utf8');
    await writeFile(`${OUT}/${f}`, html.replace(/<svg class="mark" viewBox="[^"]*" aria-hidden="true">[\s\S]*?<\/svg>/g, CLAY).replace(/<link rel="icon" href="\/favicon\.svg[^"]*" type="image\/svg\+xml">\n?/g, '').replace(/favicon-32\.png(\?v=\d+)?/g, 'favicon-32.png?v=3').replace(/apple-touch-icon\.png(\?v=\d+)?/g, 'apple-touch-icon.png?v=3'));
  }
}
await copyFile('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2', `${OUT}/fonts/figtree-latin-wght-normal.woff2`);

// Specialties page: render the tab row and one panel per specialty from specialties.json.
{
  const SP = JSON.parse(await readFile('specialties.json', 'utf8'));
  const SEE = '<li>Every source in your territory, with your share</li><li>Referrals, admissions and revenue by source, month over month and quarter over quarter</li><li>Partners going quiet, flagged with a drafted check-in</li>';
  const tabs = SP.map((s, k) => `<a class="sp-tab" href="#${s.id}" id="tab-${s.id}" role="tab" aria-controls="${s.id}" aria-selected="${k === 0}"><img src="/img/g-sp-${s.id}-cut.webp" width="160" height="160" alt="" decoding="async"><span>${s.short}</span></a>`).join('');
  const panels = SP.map((s, k) => {
    const prev = SP[(k + SP.length - 1) % SP.length], next = SP[(k + 1) % SP.length];
    return `<article class="sp-panel ${s.color}" id="${s.id}" role="tabpanel" aria-labelledby="tab-${s.id}" tabindex="-1"><div class="sp-p-main"><figure class="sp-scene"><img src="/img/g-art-sp-${s.id}-900.webp" srcset="/img/g-art-sp-${s.id}-900.webp 900w, /img/g-art-sp-${s.id}-1600.webp 1600w" sizes="(max-width: 980px) 100vw, 560px" width="1600" height="1200" alt=""${k === 0 ? '' : ' loading="lazy"'} decoding="async"></figure><h2>${s.title}</h2><p class="sp-k">Wellby is built to</p><p class="sp-do">${s.do}</p></div><div class="sp-p-side"><p class="sp-k">Who refers to you</p><ul class="sp-src">${s.src.map(c => `<li>${c}</li>`).join('')}</ul><p class="sp-k">What you'd see</p><ul class="sp-see">${SEE}</ul><div class="sp-pn"><a href="#${prev.id}" data-go="${prev.id}"><span aria-hidden="true">←</span> ${prev.short}</a><a href="#${next.id}" data-go="${next.id}">${next.short} <span aria-hidden="true">→</span></a></div></div></article>`;
  }).join('');
  const page = await readFile(`${OUT}/specialties.html`, 'utf8');
  await writeFile(`${OUT}/specialties.html`, page.replace('<!--SPECIALTIES (rendered by build.mjs from specialties.json)-->', `<div class="sp-tabs" role="tablist" aria-label="Specialties">${tabs}</div><div class="sp-panels">${panels}</div>`));
}

async function fetchBuf(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch {}
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error('fetch failed ' + url);
}

// Trim to the opaque bounds, pad to a square sitting near the bottom, export.
async function cutout(buf, sizes, center = false) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, s = Math.round(Math.max(w, h) * 1.04);
  const crop = await sharp(buf).ensureAlpha().extract({ left: x0, top: y0, width: w, height: h }).png().toBuffer();
  const square = await sharp({ create: { width: s, height: s, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: crop, left: Math.round((s - w) / 2), top: center ? Math.round((s - h) / 2) : s - h - Math.round(s * .02) }]).png().toBuffer();
  return Promise.all(sizes.map(z => sharp(square).resize(z, z).webp({ quality: 84, effort: 6 }).toBuffer()));
}

const cut = {};
let logoPng = null;
await Promise.all(SOURCES.map(async ([kind, name, url]) => {
  const buf = await fetchBuf(url);
  if (kind === 'pano') {
    // Keep the 3168x1170 band (y 110-1280 of the 3168x1344 render); hero.js uses the same frame.
    const m = await sharp(buf).metadata();
    const top = Math.round(m.height * 110 / 1344), h = Math.round(m.height * 1170 / 1344);
    const band = await sharp(buf).extract({ left: 0, top, width: m.width, height: h }).png().toBuffer();
    for (const W of [2400, 1600, 1000]) await writeFile(`${OUT}/img/g-${name}-${W}.webp`, await sharp(band).resize(W).webp({ quality: 80, effort: 6 }).toBuffer());
    return;
  }
  if (kind === 'wide') {
    // Full-bleed hero art: four widths for desktop and iPad, keeping the aspect ratio.
    for (const W of [3200, 2400, 1600, 1000]) await writeFile(`${OUT}/img/g-${name}-${W}.webp`, await sharp(buf).resize(W).webp({ quality: 80, effort: 6 }).toBuffer());
    return;
  }
  if (kind === 'art') {
    // Full-size illustration: keep the aspect ratio, two widths.
    for (const W of [1600, 900]) await writeFile(`${OUT}/img/g-${name}-${W}.webp`, await sharp(buf).resize(W).webp({ quality: 80, effort: 6 }).toBuffer());
    return;
  }
  if (kind === 'balls') {
    // 3x2 sprite sheet of clay balls: cut each cell, trim, square, 72px.
    const m = await sharp(buf).metadata();
    const cw = Math.floor(m.width / 3), ch = Math.floor(m.height / 2);
    const names = ['blue', 'yellow', 'pink', 'lime', 'lavender', 'orange'];
    for (let i = 0; i < 6; i++) {
      const cell = await sharp(buf).extract({ left: (i % 3) * cw, top: Math.floor(i / 3) * ch, width: cw, height: ch }).png().toBuffer();
      const [o] = await cutout(cell, [72], true);
      await writeFile(`${OUT}/img/g-${name}-${names[i]}.webp`, o);
    }
    return;
  }
  if (kind === 'scene') {
    const m = await sharp(buf).metadata();
    const tw = Math.min(m.width, Math.round(m.height * 4 / 5));
    const base = sharp(buf).extract({ left: Math.round((m.width - tw) / 2), top: 0, width: tw, height: m.height });
    const png = await base.png().toBuffer();
    for (const W of [600, 900]) await writeFile(`${OUT}/img/g-${name}-${W}.webp`, await sharp(png).resize(W, Math.round(W * 5 / 4)).webp({ quality: 80, effort: 6 }).toBuffer());
  } else {
    if (name === 'cl-logo') {
      const o = await cutout(buf, [512, 96, 64], true);
      await writeFile(`${OUT}/img/g-cl-logo-cut.webp`, o[0]); await writeFile(`${OUT}/img/g-cl-logo-96.webp`, o[1]); await writeFile(`${OUT}/img/g-cl-logo-64.webp`, o[2]);
      logoPng = await sharp(buf).ensureAlpha().png().toBuffer();
      return;
    }
    const main = name === 'house' || name.startsWith('stk-') ? 480 : name === 'envelope' ? 160 : name.startsWith('sp-') || name.startsWith('tier-') ? 320 : name.startsWith('tr-') ? 160 : 360;
    const small = name.startsWith('stk-') || name.startsWith('sp-');
    const sizes = name === 'house' ? [main, 600] : small ? [main, 96] : [main];
    const out = await cutout(buf, sizes, name === 'car-top');
    if (small) await writeFile(`${OUT}/img/g-${name}-96.webp`, out[1]);
    await writeFile(`${OUT}/img/g-${name}-cut.webp`, out[0]);
    if (name === 'house') await writeFile(`${OUT}/img/g-house-600.webp`, out[1]);
    cut[name] = out[0];
  }
}));

// Open Graph card, 1200x630: the hero scene on top fading into a light band with the
// tagline on the left and the clay Wellby mark on the right. Text is pre-converted to Figtree outlines (og-text.json).
const t = JSON.parse(await readFile('og-text.json', 'utf8'));
const BAND = '#E7EFFA';
const scene = await sharp(`${OUT}/img/g-hero-desk2-1600.webp`).resize(1200).extract({ left: 0, top: 16, width: 1200, height: 470 }).png().toBuffer();
const ink = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><linearGradient id="f" x1="0" y1="300" x2="0" y2="462" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${BAND}" stop-opacity="0"/><stop offset="1" stop-color="${BAND}"/></linearGradient></defs>
<rect y="300" width="1200" height="330" fill="url(#f)"/><rect y="462" width="1200" height="168" fill="${BAND}"/>
<path d="${t.tag}" fill="#0D2747"/>
<path d="${t.word}" fill="#0D2747"/></svg>`);
const og = await sharp({ create: { width: 1200, height: 630, channels: 3, background: BAND } }).composite([{ input: scene, left: 0, top: 0 }, { input: ink, left: 0, top: 0 }, { input: await sharp(logoPng).trim().resize(46, 46, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: 977, top: 523 }]).jpeg({ quality: 86, progressive: true }).toBuffer();
await writeFile(`${OUT}/og.jpg`, og);
// Home-screen and tab icons from the clay flower, on the site background.
const logoSq = await sharp(logoPng).trim().png().toBuffer();
const icon = async (n, pad) => sharp({ create: { width: n, height: n, channels: 4, background: '#F9F8F6' } }).composite([{ input: await sharp(logoSq).resize(Math.round(n * (1 - 2 * pad)), Math.round(n * (1 - 2 * pad)), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), gravity: 'center' }]).png().toBuffer();
await writeFile(`${OUT}/apple-touch-icon.png`, await icon(180, .12));
await writeFile(`${OUT}/icon-512.png`, await icon(512, .12));
const ico32 = await sharp(await sharp(logoSq).resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()).png().toBuffer();
await writeFile(`${OUT}/favicon-32.png`, ico32);
const hdr = Buffer.alloc(22); hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
hdr.writeUInt8(32, 6); hdr.writeUInt8(32, 7); hdr.writeUInt16LE(1, 10); hdr.writeUInt16LE(32, 12); hdr.writeUInt32LE(ico32.length, 14); hdr.writeUInt32LE(22, 18);
await writeFile(`${OUT}/favicon.ico`, Buffer.concat([hdr, ico32]));
console.log('build complete');
