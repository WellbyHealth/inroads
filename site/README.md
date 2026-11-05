# Wellby marketing site

Live at https://wellbyinroads.com (Vercel project `inroad-site`, team `aria`).

## How it works
- This folder is the marketing site inside the shared `WellbyHealth/inroads` repo. The Wellby app lives at the repo root; don't change app files from site work.
- The Vercel project `inroad-site` uses Root Directory `site` and only rebuilds when files under `site/` change.
- `public/` is the whole site as served: HTML, CSS, JS, fonts and images. The only build step is `node tools/blog.mjs` (set in `vercel.json`), which publishes dated blog posts. See Blog below.
- Every push to `main` deploys to production. Other branches get preview deployments.
- `vercel.json` holds clean URLs, cache headers, redirects from the old `inroad-site.vercel.app` pages and the `/blog` rewrite.

## Editing
- Pages: edit the HTML in `public/` directly (`index.html`, `pricing.html`, `specialties.html`, `compare/*.html`, `blog/*.html`, `privacy.html`, `404.html`).
- Shared header and footer are repeated in each page; change them everywhere.
- Images the Wellby app hotlinks live in `public/img/`. Do not rename or delete files there.
- Blog posts are Markdown files in `content/blog/posts/` (see Blog below). Do not hand-edit `public/blog/<new post>.html`, `blog/index.html`, `blog/rss.xml`, `sitemap.xml` blog rows, the blog section of `llms.txt` or the home page blog strip; `tools/blog.mjs` regenerates them.
- Blog rule: guides explain why and what, never how Wellby does it (no data-matching methods, formulas, thresholds or ranking logic).
- Contact address everywhere: team@wellbyhealth.com.

## tools/
The scripts that originally generated this site from FLORA renders (`build.mjs` and the post-build steps). They are kept for reference and for regenerating art; they are not run on deploy.

## After editing any CSS or JS
Run `python3 site/tools/bust.py` before committing. It stamps every `<link>`/`<script>` in the HTML with `?v=<content hash>`, so browsers always load the new file (CSS/JS are cached for a day).

## Blog (scheduled posts)
- Source: `content/blog/posts/NN-slug.md` with front matter (title, slug, date, description, tag, art, keyphrase, takeaways) and a Markdown body. `content/blog/legacy.json` lists the five older hand-written posts. Optional share image: `content/blog/og/<slug>.jpg` (1200x630).
- `node tools/blog.mjs` publishes only posts dated today (US Pacific) or earlier and rewrites the post pages, `blog/index.html`, the home page strip, `blog/rss.xml`, the blog rows of `sitemap.xml` and the Guides list in `llms.txt`. Unpublished posts appear nowhere.
- `node tools/blog.mjs --check` validates every post, future ones included: word count, dashes, banned phrases, percentages outside labeled examples, links, keyphrase placement. Run it before every commit that touches posts. `--today=YYYY-MM-DD` previews a later date.
- Posts release on time because production is redeployed every day by a scheduled task; each deploy re-runs the build.
- After editing CSS or JS run `python3 tools/bust.py`; the blog build copies its stylesheet links from the first post in `legacy.json`, so commit after bust.
