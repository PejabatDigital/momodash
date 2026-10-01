const LEVELS = ['beginner', 'normal'];
const BOARD_SIZE = 10;
const MAX_SCORE = 200000;
const RATE_LIMIT_MS = 10000;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json' }
  });
}

function cleanName(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

async function getLeaderboard(url, env) {
  const level = url.searchParams.get('level');
  if (!LEVELS.includes(level)) return json({ error: 'invalid level' }, 400);

  const { results } = await env.DB.prepare(
    'SELECT name, score, created_at FROM scores WHERE level = ?1 ORDER BY score DESC, created_at ASC LIMIT ?2'
  ).bind(level, BOARD_SIZE).all();

  return json({
    level,
    entries: results.map(r => ({ n: r.name, s: r.score, t: r.created_at }))
  });
}

async function postScore(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'invalid body' }, 400);
  }

  const level = body.level;
  const name = cleanName(body.name);
  const score = Math.floor(Number(body.score));

  if (!LEVELS.includes(level)) return json({ error: 'invalid level' }, 400);
  if (!name) return json({ error: 'invalid name' }, 400);
  if (!Number.isFinite(score) || score <= 0 || score > MAX_SCORE) return json({ error: 'invalid score' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();

  const recent = await env.DB.prepare(
    'SELECT created_at FROM scores WHERE ip = ?1 ORDER BY created_at DESC LIMIT 1'
  ).bind(ip).first();
  if (recent && now - recent.created_at < RATE_LIMIT_MS) {
    return json({ error: 'too many submissions' }, 429);
  }

  await env.DB.prepare(
    'INSERT INTO scores (level, name, score, ip, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(level, name, score, ip, now).run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      return getLeaderboard(url, env);
    }
    if (url.pathname === '/api/scores' && request.method === 'POST') {
      return postScore(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
