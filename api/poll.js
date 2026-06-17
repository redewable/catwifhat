/* ============================================================
   /api/poll  — global "Who you got?" vote counter (Vercel serverless)

   Zero-dependency: talks to Upstash Redis over its REST API using fetch.
   Set these env vars in Vercel (Upstash has a free tier; the Vercel
   Upstash integration sets them for you):
     UPSTASH_REDIS_REST_URL
     UPSTASH_REDIS_REST_TOKEN

   GET  /api/poll?event=<id>          → { home, away }
   POST /api/poll  {event, side}      → { home, away }   (side = "home"|"away")

   If env vars are missing it returns 200 {home:null,away:null} so the
   front-end simply hides the vote bar (graceful, no errors).
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

  // Not configured → tell the client to hide the poll, don't error.
  if (!URL || !TOKEN) { res.status(200).json({ home: null, away: null, configured: false }); return; }

  try {
    const event = sanitize((req.query && req.query.event) || (req.body && req.body.event));
    if (!event) { res.status(400).json({ error: "missing event" }); return; }
    const kHome = "poll:" + event + ":home";
    const kAway = "poll:" + event + ":away";

    if (req.method === "POST") {
      let side = (req.body && req.body.side) || "";
      if (typeof req.body === "string") { try { side = JSON.parse(req.body).side; } catch (e) {} }
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
