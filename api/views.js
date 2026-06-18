/* ============================================================
   /api/views — per-page view counter (Vercel serverless)

   Zero-dependency: talks to Upstash Redis over its REST API using fetch
   (same env vars as /api/poll):
     UPSTASH_REDIS_REST_URL
     UPSTASH_REDIS_REST_TOKEN

   GET /api/views?page=<slug>          → { page, views }   (read only)
   GET /api/views?page=<slug>&hit=1    → { page, views }   (increment first)

   If env vars are missing it returns 200 {configured:false} so the
   front-end simply hides the counter (graceful, no errors).
   ============================================================ */

// Tolerate values accidentally pasted with their NAME= prefix and/or quotes
// (e.g. a whole .env line dropped into Vercel's value box).
function cleanEnv(v) { return v == null ? v : String(v).trim().replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "").replace(/^["']|["']$/g, "").trim(); }
const URL = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
const TOKEN = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);

async function redis(command) {
  const res = await fetch(URL + "/" + command.map(encodeURIComponent).join("/"), {
    headers: { Authorization: "Bearer " + TOKEN },
  });
  if (!res.ok) throw new Error("redis " + res.status);
  return (await res.json()).result;
}

function sanitize(s) { return String(s || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40); }

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (!URL || !TOKEN) { res.status(200).json({ configured: false }); return; }

  try {
    const page = sanitize((req.query && req.query.page)) || "home";
    const hit = (req.query && String(req.query.hit) === "1") || req.method === "POST";
    const key = "views:" + page;
    const views = hit ? await redis(["INCR", key]) : (parseInt(await redis(["GET", key]), 10) || 0);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ page: page, views: Number(views) || 0, configured: true });
  } catch (e) {
    res.status(200).json({ configured: false, error: "unavailable" });
  }
};
