# Wellby app (app.wellbyinroads.com)

Referral intelligence and a system of action for post-acute care. The marketing site (wellbyinroads.com) is a separate Vercel project.

## Layout
- `public/`: static front end.
  - `index.html` is the app shell. `login.html` and `signup.html` are the sign-in and the 3-step signup (plan, agency, Stripe Checkout).
  - The main bundle is `public/app.js`. `pack.sh` packs it into `app.NN.bin` plus `load.js`, and those packed files are what get served. Run `./pack.sh` after editing `app.js`.
  - Feature extensions are `x-*.js` and `x-*.css`.
- `api/`: Vercel serverless functions (Node 22). The Hobby plan allows 12; 11 are used.
  - `auth`: sign in, sign up, password.
  - `billing`: Stripe Checkout, the customer portal and the webhook.
  - `data`, `market`, `draft`, `calendar`, `connect`, `users`, `workspaces`, `ingest`, `mcp`.
- `lib/`: shared server code: auth/session, Vercel Blob storage, HTTP helpers, connectors.
- `vercel.json`: rewrites (site art and icons come from wellbyinroads.com), headers, and redirects from the old host.

## Environment (set in Vercel, never committed)
- `SESSION_SECRET` and `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` (the first staff login).
- `BLOB_READ_WRITE_TOKEN` (storage), `ANTHROPIC_API_KEY` (outreach drafts), `INGEST_SECRET`.
- Stripe:
  - `STRIPE_SECRET_KEY` comes from the Vercel Stripe integration, linked to the live Wellby, Inc. account.
  - `STRIPE_WEBHOOK_SECRET` is the signing secret for the webhook at `/api/billing?webhook=1`.
  - `BILLING_ON=1` turns on card-at-signup. Without it, signup gives a 14-day trial with no card.

## Billing
- Plans are priced per user: Insight $99, Growth $199, Network $179 with a 5-user minimum. Annual billing is 10× the monthly price.
- Stripe prices are found by lookup key (`wellby_<plan>_monthly|annual`), so no price IDs are kept in code or env.
- The plan list appears in both `api/billing.js` (`PLANS`) and `public/signup.html`. Keep them in sync.
