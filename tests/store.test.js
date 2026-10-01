import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { openStore } from '../database/store.js';

test('SQLite persists records across reopen and cascades deletions to personal records', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'psyche-store-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'psyche.sqlite');
  let db = openStore(path);
  try {
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(
      'user',
      'Roman',
      'roman@example.test',
      'test-hash',
      '2026-10-01',
    );
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
      'token-hash',
      'user',
      'csrf-token',
      Date.now() + 60000,
    );
    db.prepare('INSERT INTO reflections VALUES (?,?,?,?)').run(
      'reflection',
      'user',
      '2026-10-01',
      JSON.stringify({ situation: 'A durable reflection' }),
    );
    db.prepare('INSERT INTO patterns VALUES (?,?,?,?,?,?,?,?)').run(
      'pattern',
      'user',
      'reflection',
      0,
      'An unconfirmed hypothesis',
      'hypothesis',
      0,
      '2026-10-01',
    );
    db.close();
    db = openStore(path);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
      1,
    );
    assert.equal(
      JSON.parse(db.prepare('SELECT body FROM reflections').get().body)
        .situation,
      'A durable reflection',
    );
    assert.equal(
      db.prepare('SELECT status FROM patterns').get().status,
      'hypothesis',
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
      1,
    );
    db.prepare('DELETE FROM reflections WHERE id=?').run('reflection');
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM patterns').get().count,
      0,
    );
    db.prepare('INSERT INTO reflections VALUES (?,?,?,?)').run(
      'reflection2',
      'user',
      '2026-10-01',
      '{}',
    );
    db.prepare('INSERT INTO patterns VALUES (?,?,?,?,?,?,?,?)').run(
      'pattern2',
      'user',
      'reflection2',
      0,
      'Another hypothesis',
      'hypothesis',
      0,
      '2026-10-01',
    );
    db.prepare('DELETE FROM users WHERE id=?').run('user');
    for (const table of ['users', 'sessions', 'reflections', 'patterns']) {
      assert.equal(
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
        0,
      );
    }
  } finally {
    db.close();
  }
});

test('database and live SQLite sidecars remain private under a conventional 022 umask', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'psyche-permissions-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const script = `
    import { statSync } from 'node:fs';
    import { openStore } from ${JSON.stringify(new URL('../database/store.js', import.meta.url).href)};
    process.umask(0o022);
    const path = process.argv[1];
    const db = openStore(path);
    const modes = ['', '-wal', '-shm'].map((suffix) => statSync(path + suffix).mode & 0o777);
    db.close();
    console.log(JSON.stringify(modes));
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script, join(directory, 'psyche.sqlite')],
    { encoding: 'utf8' },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), [0o600, 0o600, 0o600]);
});
