# catwifhat — analytics setup

First-party, cookie-free analytics. Tracking ships live in the site; it
starts recording the moment the backend env vars are set.

## What it captures
`pageview`, `pageleave` (time-on-page + scroll depth), `buy_click`,
`trade_click`, `copy_contract`, `meme_open`, `banner_view`,
`pfp_download`, `pfp_nation`, `poll_vote` (match / champion / golf),
`share_click`, `scores_tab`, `sport_open` — each with page, a stable
visitor id, a per-tab session id, referrer, UTM tags, device, and
edge geo (country / region / city, no IPs stored).

## One-time setup

1. **Supabase** → SQL editor → run [`supabase-analytics.sql`](supabase-analytics.sql).
2. **Vercel** → Project → Settings → Environment Variables, add:
   - `SUPABASE_URL` — e.g. `https://xxxx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — the **service_role** secret (Project → Settings → API). Keep private; it's only used server-side in `/api/track` and `/api/stats`.
   - `STATS_TOKEN` — any long random string you choose (this is your dashboard password).
   - (Paste just the value — no `NAME=`, no quotes. The code tolerates it either way.)
3. **Redeploy.**

## View the dashboard
Open `https://www.catwifusdc.com/stats?key=YOUR_STATS_TOKEN`.
The key is remembered in that browser. Range selector: 24h / 7d / 30d / 90d.

## Tag your links (so you know what drives traffic)
Add UTM params to the links you post:
`https://www.catwifusdc.com/?utm_source=twitter&utm_campaign=launch`
`?utm_source=telegram`, `?utm_source=reddit`, etc. They show up under
**Campaign tags** and **Campaigns** in the dashboard.

## Vercel Web Analytics (optional baseline)
The `/_vercel/insights/script.js` tag is already on every page. Turn on
**Web Analytics** in the Vercel project (Analytics tab) and it lights up
with zero extra work — a privacy-first second view of pageviews,
referrers, countries and devices.

## Privacy
No cookies, no third-party trackers, no IP storage. Visitor/session ids
are random first-party values in local/session storage.
