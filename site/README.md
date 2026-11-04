# Wellby marketing site

Live at https://wellbyinroads.com (Vercel project `inroad-site`, team `aria`).

## How it works
- This folder is the marketing site inside the shared `WellbyHealth/inroads` repo. The Wellby app lives at the repo root; don't change app files from site work.
- The Vercel project `inroad-site` uses Root Directory `site` and only rebuilds when files under `site/` change.
- `public/` is the whole site, exactly as served: HTML, CSS, JS, fonts and images. There is no build step.
- Every push to `main` deploys to production. Other branches get preview deployments.
- `vercel.json` holds clean URLs, cache headers, redirects from the old `inroad-site.vercel.app` pages and the `/blog` rewrite.

## Editing
- Pages: edit the HTML in `public/` directly (`index.html`, `pricing.html`, `specialties.html`, `compare/*.html`, `blog/*.html`, `privacy.html`, `404.html`).
- Shared header and footer are repeated in each page; change them everywhere.
- Images the Wellby app hotlinks live in `public/img/`. Do not rename or delete files there.
- When adding a blog post, also add it to `public/blog/index.html`, `public/blog/rss.xml`, `public/sitemap.xml` and `public/llms.txt`.
- Blog rule: guides explain why and what, never how Wellby does it (no data-matching methods, formulas, thresholds or ranking logic).
- Contact address everywhere: team@wellbyhealth.com.

## tools/
The scripts that originally generated this site from FLORA renders (`build.mjs` and the post-build steps). They are kept for reference and for regenerating art; they are not run on deploy.

## After editing any CSS or JS
Run `python3 site/tools/bust.py` before committing. It stamps every `<link>`/`<script>` in the HTML with `?v=<content hash>`, so browsers always load the new file (CSS/JS are cached for a day).
