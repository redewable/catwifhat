/* ============================================================
   /api/stats — read-only analytics aggregates for the /stats dashboard.
   Protected by a shared secret (STATS_TOKEN). Calls the Supabase RPC
   functions from supabase-analytics.sql with the service-role key.

   Env (set in Vercel):
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     STATS_TOKEN                 (any long random string you choose)

   GET /api/stats?key=<STATS_TOKEN>&days=7
   ============================================================ */

function cleanEnv(v) { return v == null ? v : String(v).trim().replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "").replace(/^["']|["']$/g, "").trim(); }
// Accept either our own names or the NEXT_PUBLIC_* ones Supabase's Vercel integration sets.
const SB_URL = cleanEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
const SB_KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
const TOKEN = cleanEnv(process.env.STATS_TOKEN);

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  // Safe wiring check (booleans + host only, never secret values): /api/stats?diag=1
  if (req.query && req.query.diag) {
    let host = ""; try { host = SB_URL ? new (require("url").URL)(SB_URL).host : ""; } catch (e) { host = "(unparseable url)"; }
    let rpcOk = false;
    if (SB_URL && SB_KEY) {
      try {
        const r = await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/rpc/stats_overview", {
          method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ p_since: new Date(0).toISOString() })
        });
        rpcOk = r.ok;   // true only if the SQL functions exist
      } catch (e) {}
    }
    res.status(200).json({ hasUrl: !!SB_URL, hasServiceKey: !!SB_KEY, hasToken: !!TOKEN, host: host, rpcOk: rpcOk });
    return;
  }
  if (!SB_URL || !SB_KEY) { res.status(200).json({ configured: false }); return; }
  if (!TOKEN || (req.query && req.query.key) !== TOKEN) { res.status(401).json({ error: "unauthorized" }); return; }

  const days = Math.max(1, Math.min(90, parseInt((req.query && req.query.days), 10) || 7));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const bucket = days <= 2 ? "hour" : "day";

  async function rpc(fn, args) {
    try {
      const r = await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  try {
    const [overview, series, pages, referrers, countries, sources, devices, campaigns] = await Promise.all([
      rpc("stats_overview", { p_since: since }),
      rpc("stats_timeseries", { p_since: since, p_bucket: bucket }),
      rpc("stats_top", { p_dim: "page", p_since: since }),
      rpc("stats_top", { p_dim: "referrer_host", p_since: since }),
      rpc("stats_top", { p_dim: "country", p_since: since }),
      rpc("stats_top", { p_dim: "utm_source", p_since: since }),
      rpc("stats_top", { p_dim: "device", p_since: since }),
      rpc("stats_top", { p_dim: "utm_campaign", p_since: since })
    ]);
    res.status(200).json({ configured: true, days: days, bucket: bucket, overview: overview, series: series, pages: pages, referrers: referrers, countries: countries, sources: sources, devices: devices, campaigns: campaigns });
  } catch (e) {
    res.status(200).json({ configured: true, error: "unavailable" });
  }
};
