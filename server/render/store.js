// Quotas, rate limits and spending, kept in a Cloudflare D1 database (binding BINA_DB).
//
// Every attempt is a row in render_jobs. Before a provider is called, a row is reserved
// with its estimated cost by ONE conditional INSERT, so two requests at the same moment can
// not both slip under a limit: D1 runs each statement atomically. Afterwards the row gets
// the real cost (or keeps the estimate when the provider's billing is unknown).
//
// Only hashed identifiers are stored: no addresses, codes, images or prompts.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS render_jobs (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    day TEXT NOT NULL,
    month TEXT NOT NULL,
    user_key TEXT NOT NULL,
    ip_key TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    quality TEXT NOT NULL,
    aspect TEXT NOT NULL,
    images INTEGER NOT NULL,
    scene_revision TEXT NOT NULL,
    status TEXT NOT NULL,
    charged INTEGER NOT NULL DEFAULT 1,
    est_usd REAL NOT NULL,
    actual_usd REAL,
    error_code TEXT,
    latency_ms INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS render_jobs_month ON render_jobs (month, charged)',
  'CREATE INDEX IF NOT EXISTS render_jobs_user_day ON render_jobs (user_key, day)',
  'CREATE INDEX IF NOT EXISTS render_jobs_ip_time ON render_jobs (ip_key, created_at)',
];

const ready = new WeakSet();
export async function ensureSchema(db) {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  ready.add(db);
}

export const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
export const monthOf = (t) => new Date(t).toISOString().slice(0, 7);

const RESERVE = `INSERT INTO render_jobs
  (id, created_at, day, month, user_key, ip_key, provider, model, quality, aspect, images, scene_revision, status, charged, est_usd)
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'reserved', 1, ?13
  WHERE (SELECT COALESCE(SUM(COALESCE(actual_usd, est_usd)), 0) FROM render_jobs WHERE month = ?4 AND charged = 1) + ?13 <= ?14
    AND (SELECT COUNT(*) FROM render_jobs WHERE user_key = ?5 AND day = ?3 AND charged = 1) < ?15
    AND (SELECT COUNT(*) FROM render_jobs WHERE day = ?3 AND charged = 1) < ?16
    AND (SELECT COUNT(*) FROM render_jobs WHERE ip_key = ?6 AND created_at > ?2 - 60000) < ?17
    AND (SELECT COUNT(*) FROM render_jobs WHERE user_key = ?5 AND status = 'reserved' AND created_at > ?2 - ?18) = 0`;

// Reserve one attempt. Returns { ok: true } or { ok: false, reason } where reason is one of
// budget_exhausted, user_quota, daily_quota, rate_limited, busy.
export async function reserve(db, job, limits) {
  await ensureSchema(db);
  const day = dayOf(job.now);
  const month = monthOf(job.now);
  const res = await db.prepare(RESERVE).bind(
    job.id, job.now, day, month, job.userKey, job.ipKey, job.provider, job.model, job.quality, job.aspect, job.images,
    job.sceneRevision, job.estUsd, limits.monthlyBudget, limits.perUserDaily, limits.totalDaily, limits.perMinute, limits.staleMs,
  ).run();
  if ((res?.meta?.changes ?? res?.changes ?? 0) > 0) return { ok: true };
  const s = await usage(db, { userKey: job.userKey, ipKey: job.ipKey, now: job.now, staleMs: limits.staleMs });
  let reason = 'busy';
  if (s.monthSpent + job.estUsd > limits.monthlyBudget) reason = 'budget_exhausted';
  else if (s.userToday >= limits.perUserDaily) reason = 'user_quota';
  else if (s.today >= limits.totalDaily) reason = 'daily_quota';
  else if (s.ipLastMinute >= limits.perMinute) reason = 'rate_limited';
  return { ok: false, reason, usage: s };
}

export async function usage(db, { userKey = '', ipKey = '', now, staleMs = 0 }) {
  await ensureSchema(db);
  const day = dayOf(now);
  const month = monthOf(now);
  const row = await db.prepare(`SELECT
      (SELECT COALESCE(SUM(COALESCE(actual_usd, est_usd)), 0) FROM render_jobs WHERE month = ?1 AND charged = 1) AS month_spent,
      (SELECT COUNT(*) FROM render_jobs WHERE user_key = ?3 AND day = ?2 AND charged = 1) AS user_today,
      (SELECT COUNT(*) FROM render_jobs WHERE day = ?2 AND charged = 1) AS today,
      (SELECT COUNT(*) FROM render_jobs WHERE ip_key = ?4 AND created_at > ?5 - 60000) AS ip_minute,
      (SELECT COUNT(*) FROM render_jobs WHERE user_key = ?3 AND status = 'reserved' AND created_at > ?5 - ?6) AS running`)
    .bind(month, day, userKey, ipKey, now, staleMs).first();
  return {
    monthSpent: Number(row?.month_spent || 0),
    userToday: Number(row?.user_today || 0),
    today: Number(row?.today || 0),
    ipLastMinute: Number(row?.ip_minute || 0),
    running: Number(row?.running || 0),
  };
}

// Close an attempt. charged=false releases its cost and its place in the quotas.
export async function finish(db, id, { status, charged, actualUsd = null, errorCode = null, latencyMs = null }) {
  await ensureSchema(db);
  await db.prepare('UPDATE render_jobs SET status = ?2, charged = ?3, actual_usd = ?4, error_code = ?5, latency_ms = ?6 WHERE id = ?1')
    .bind(id, status, charged ? 1 : 0, actualUsd, errorCode, latencyMs).run();
}

// The highest real per-image cost of recent successful renders with the same model, quality
// and frame (null when there are none). OpenAI publishes no per-image figure for GPT Image
// 2.5, so the server never estimates below what such an image has actually cost.
export async function recentCost(db, { provider, model, quality, aspect, now, days = 30, limit = 20 }) {
  await ensureSchema(db);
  const row = await db.prepare(`SELECT MAX(per_image) AS m FROM (
      SELECT actual_usd * 1.0 / images AS per_image FROM render_jobs
      WHERE provider = ?1 AND model = ?2 AND quality = ?3 AND aspect = ?4 AND status = 'succeeded'
        AND actual_usd IS NOT NULL AND created_at > ?5
      ORDER BY created_at DESC LIMIT ?6)`)
    .bind(provider, model, quality, aspect, now - days * 86400000, limit).first();
  const v = Number(row?.m);
  return Number.isFinite(v) && v > 0 ? v : null;
}
