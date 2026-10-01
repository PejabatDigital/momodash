CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL CHECK(level IN ('beginner','normal')),
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  ip TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_scores_level_score ON scores(level, score DESC, created_at ASC);
CREATE INDEX idx_scores_ip_created ON scores(ip, created_at DESC);
