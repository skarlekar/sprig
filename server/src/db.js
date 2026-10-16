// SQLite storage through Node's built-in node:sqlite. Migrations are numbered and additive.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = [
  `CREATE TABLE users(
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, avatar_url TEXT,
     role TEXT NOT NULL DEFAULT 'user', seeded INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL, last_login_at TEXT, disabled_at TEXT);
   CREATE TABLE identities(
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     provider TEXT NOT NULL, subject TEXT NOT NULL, email TEXT, created_at TEXT NOT NULL,
     UNIQUE(provider, subject));
   CREATE TABLE sessions(
     token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT, ip TEXT);
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE maps(
     owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
     title TEXT NOT NULL DEFAULT '', doc TEXT NOT NULL, format INTEGER NOT NULL DEFAULT 1,
     version INTEGER NOT NULL, node_count INTEGER NOT NULL DEFAULT 0, theme TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
     PRIMARY KEY(owner_id, id));
   CREATE INDEX maps_owner_updated ON maps(owner_id, updated_at DESC);
   CREATE TABLE map_revisions(
     id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, map_id TEXT NOT NULL,
     version INTEGER NOT NULL, doc TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
     FOREIGN KEY(owner_id, map_id) REFERENCES maps(owner_id, id) ON DELETE CASCADE);
   CREATE INDEX revisions_map ON map_revisions(owner_id, map_id, created_at DESC);
   CREATE TABLE share_links(
     id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, map_id TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE, token_enc TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT,
     FOREIGN KEY(owner_id, map_id) REFERENCES maps(owner_id, id) ON DELETE CASCADE);
   CREATE UNIQUE INDEX share_links_active ON share_links(owner_id, map_id) WHERE revoked_at IS NULL;`,
];

export function openDb(config) {
  let file = config.dbFile;
  if (!file) { fs.mkdirSync(config.dataDir, { recursive: true }); file = path.join(config.dataDir, 'sprig.db'); }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  MIGRATIONS.forEach((sql, i) => {
    const v = i + 1; if (done.has(v)) return;
    tx(db, () => { db.exec(sql); db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(v, new Date().toISOString()); });
  });
  return db;
}

// Runs fn inside a transaction; node:sqlite has no helper for this.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
