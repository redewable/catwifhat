/* ============================================================
   /api/poll  — global "Who you got?" vote counter (Vercel serverless)

   Zero-dependency: talks to Upstash Redis over its REST API using fetch.
   Set these env vars in Vercel (Upstash has a free tier; the Vercel
   Upstash integration sets them for you):
     UPSTASH_REDIS_REST_URL
     UPSTASH_REDIS_REST_TOKEN

   GET  /api/poll?event=<id>          → { home, away }
   POST /api/poll  {event, side}      → { home, away }   (side = "home"|"away")

   Champion tally (one global hash of team → votes):
   GET  /api/poll?champ=1             → { teams:{ABBR:n,...}, total }
   POST /api/poll  {champ:1, team}    → { teams:{...}, total }

   If env vars are missing it returns 200 {configured:false} so the
   front-end simply falls back to a local tally (graceful, no errors).
   ============================================================ */

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  // command: array, e.g. ["INCR","poll:123:home"]
  const res = await fetch(URL + "/" + command.map(encodeURIComponent).join("/"), {
    headers: { Authorization: "Bearer " + TOKEN },
  });
  if (!res.ok) throw new Error("redis " + res.status);
  const data = await res.json();
  return data.result;
}

function sanitize(id) { return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40); }

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  // Parse a possibly-stringified JSON body once.
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Not configured → tell the client to fall back to a local tally, don't error.
  if (!URL || !TOKEN) { res.status(200).json({ configured: false }); return; }

  // ---- Champion tally (global hash of team → votes) ----
  const isChamp = (req.query && req.query.champ != null) || body.champ != null;
  if (isChamp) {
    try {
      const HKEY = "champ:wc";
      if (req.method === "POST") {
        const team = sanitize(body.team);
        if (!team) { res.status(400).json({ error: "missing team" }); return; }
        await redis(["HINCRBY", HKEY, team, "1"]);
      }
      const flat = (await redis(["HGETALL", HKEY])) || [];
      const teams = {}; let total = 0;
      for (let i = 0; i < flat.length; i += 2) { const n = parseInt(flat[i + 1], 10) || 0; teams[flat[i]] = n; total += n; }
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ teams: teams, total: total, configured: true });
    } catch (e) {
      res.status(200).json({ error: "unavailable" });
    }
    return;
  }

  try {
    const event = sanitize((req.query && req.query.event) || body.event);
    if (!event) { res.status(400).json({ error: "missing event" }); return; }
    const kHome = "poll:" + event + ":home";
    const kAway = "poll:" + event + ":away";

    if (req.method === "POST") {
      const side = body.side || "";
      if (side !== "home" && side !== "away") { res.status(400).json({ error: "bad side" }); return; }
      await redis(["INCR", side === "home" ? kHome : kAway]);
    }

    const home = parseInt(await redis(["GET", kHome]), 10) || 0;
    const away = parseInt(await redis(["GET", kAway]), 10) || 0;
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ home: home, away: away, configured: true });
  } catch (e) {
    res.status(200).json({ home: null, away: null, error: "unavailable" });
  }
};
