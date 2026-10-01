import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, openSync, closeSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openStore(path) {
  if (path !== ':memory:') {
    mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    // SQLite derives new WAL/SHM permissions from the database file's mode.
    // Set it before opening SQLite, including when the volume directory already exists.
    closeSync(openSync(path, 'a', 0o600));
    for (const file of [path, `${path}-wal`, `${path}-shm`]) {
      if (existsSync(file)) chmodSync(file, 0o600);
    }
  }
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, body TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS patterns (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reflection_id TEXT NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
      candidate_index INTEGER NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL
      CHECK (status IN ('hypothesis','confirmed','partially_confirmed','rejected')),
      confidence REAL NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(user_id, reflection_id, candidate_index)
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS reflections_owner ON reflections(user_id, created_at);
    CREATE INDEX IF NOT EXISTS patterns_owner ON patterns(user_id);
  `);
  if (path !== ':memory:') chmodSync(path, 0o600);
  return db;
}
