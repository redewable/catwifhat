/* ============================================================
   /api/track — first-party event ingestion (Vercel serverless)

   Writes one row per event into the Supabase `events` table using the
   service-role key (server-side only — never shipped to the browser).
   Enriches each event with Vercel's edge geo headers (country/region/
   city) so you get location without storing IPs.

   Env (set in Vercel):
     SUPABASE_URL                 e.g. https://xxxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY    (service_role secret — keep private)

   If unset it returns 200 {configured:false} and the client silently
   stops tracking (no errors).
   ============================================================ */

function cleanEnv(v) { return v == null ? v : String(v).trim().replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "").replace(/^["']|["']$/g, "").trim(); }
// Accept either our own names or the NEXT_PUBLIC_* ones Supabase's Vercel integration sets.
const SB_URL = cleanEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
const SB_KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

function clip(s, n) { if (s == null) return null; s = String(s); return s.length > n ? s.slice(0, n) : s; }
function hostOf(u) { try { return new (require("url").URL)(u).host || null; } catch (e) { return null; } }
function dec(s) { try { return s ? decodeURIComponent(s) : null; } catch (e) { return s || null; } }

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!SB_URL || !SB_KEY) { res.status(200).json({ configured: false }); return; }

  // sendBeacon delivers the body as text/plain; parse defensively.
  let e = req.body;
  if (typeof e === "string") { try { e = JSON.parse(e); } catch (x) { e = {}; } }
  e = e || {};

  const u = e.utm || {};
  const h = req.headers || {};
  const row = {
    type: clip(e.type, 40) || "event",
    page: clip(e.page, 80),
    session_id: clip(e.session, 64),
    visitor_id: clip(e.visitor, 64),
    referrer: clip(e.ref, 400),
    referrer_host: hostOf(e.ref),
    utm_source: clip(u.source, 80),
    utm_medium: clip(u.medium, 80),
    utm_campaign: clip(u.campaign, 120),
    country: clip(h["x-vercel-ip-country"], 4) || null,
    region: clip(h["x-vercel-ip-country-region"], 8) || null,
    city: clip(dec(h["x-vercel-ip-city"]), 80),
    device: clip(e.device, 12),
    meta: (e.meta && typeof e.meta === "object") ? e.meta : null
  };

  try {
    const r = await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/events", {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row)
    });
    if (!r.ok) { res.status(200).json({ ok: false }); return; }
    res.status(204).end();
  } catch (x) {
    res.status(200).json({ ok: false });
  }
};
