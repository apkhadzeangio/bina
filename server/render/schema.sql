-- D1 schema of the render service (binding BINA_DB). The service creates it on first use;
-- this file is for creating it by hand: Cloudflare dashboard → D1 → your database → Console.
CREATE TABLE IF NOT EXISTS render_jobs (
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
);
CREATE INDEX IF NOT EXISTS render_jobs_month ON render_jobs (month, charged);
CREATE INDEX IF NOT EXISTS render_jobs_user_day ON render_jobs (user_key, day);
CREATE INDEX IF NOT EXISTS render_jobs_ip_time ON render_jobs (ip_key, created_at);

-- Spending this month:
--   SELECT month, ROUND(SUM(COALESCE(actual_usd, est_usd)), 4) AS usd, COUNT(*) AS renders
--   FROM render_jobs WHERE charged = 1 GROUP BY month;
