import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../backend/app.js';

const password = 'A-long-test-password-42!';
const reflectionInput = {
  situation: 'Eine Kollegin hat seit gestern nicht geantwortet.',
  thought: 'Vielleicht habe ich etwas falsch gemacht.',
  emotion: 'Unsicherheit und Anspannung',
  behavior: 'Ich prüfe immer wieder meine Nachrichten.',
  consequence: 'Ich kann mich schwer auf die Arbeit konzentrieren.',
  counterCheck: 'Vielleicht ist sie beschäftigt oder im Urlaub.',
  strategy: 'Heute lege ich das Handy für 30 Minuten beiseite.',
  mood: 3,
  useAi: false,
};

async function setup(t) {
  const { app, db } = createApp({
    dbPath: ':memory:',
    secureCookies: false,
    aiEnabled: false,
    rateLimit: false,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    db.close();
  });

  function client() {
    let cookie = '';
    let csrfToken = '';
    return {
      get cookie() {
        return cookie;
      },
      async request(path, options = {}) {
        const { method = 'GET', body, headers = {}, raw } = options;
        const response = await fetch(`${origin}${path}`, {
          method,
          headers: {
            Origin: origin,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            ...(body !== undefined || raw !== undefined
              ? { 'Content-Type': 'application/json' }
              : {}),
            ...headers,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          ...(raw !== undefined ? { body: raw } : {}),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const text = await response.text();
        const data = text ? JSON.parse(text) : null;
        if (data?.csrfToken) csrfToken = data.csrfToken;
        return { status: response.status, headers: response.headers, data };
      },
      async register(email = 'roman@example.test') {
        const result = await this.request('/api/auth/register', {
          method: 'POST',
          body: { name: 'Roman', email, password },
        });
        assert.equal(result.status, 201);
        const session = await this.request('/api/session');
        assert.equal(session.status, 200);
        assert.equal(session.data.user.email, email);
        assert.ok(session.data.csrfToken);
        return result;
      },
      async reflect(input = {}) {
        const result = await this.request('/api/reflections', {
          method: 'POST',
          body: { ...reflectionInput, ...input },
        });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        return result.data.reflection;
      },
      async savePattern(reflectionId) {
        const result = await this.request('/api/patterns', {
          method: 'POST',
          body: { reflectionId, candidateIndex: 0 },
        });
        assert.equal(result.status, 201, JSON.stringify(result.data));
        return result.data.pattern;
      },
    };
  }
  return { client, origin };
}

test('registration, password authentication, cookies, logout and session revocation', async (t) => {
  const { client } = await setup(t);
  const user = client();
  const anonymous = await user.request('/api/session');
  assert.equal(anonymous.data.user, null);
  assert.equal(anonymous.data.aiAvailable, false);

  const registration = await user.register();
  const cookie = registration.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=(Lax|Strict)/i);
  assert.match(cookie, /Path=\//i);
  assert.doesNotMatch(cookie, /A-long-test-password/);
  const oldCookie = user.cookie;
  const logout = await user.request('/api/auth/logout', {
    method: 'POST',
    body: {},
  });
  assert.equal(logout.status, 204);
  assert.equal((await user.request('/api/session')).data.user, null);
  const replay = await user.request('/api/reflections', {
    headers: { Cookie: oldCookie },
  });
  assert.equal(replay.status, 401);

  const invalidLogin = await user.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'roman@example.test', password: 'incorrect-password' },
  });
  assert.equal(invalidLogin.status, 401);
  const validLogin = await user.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'roman@example.test', password },
  });
  assert.equal(validLogin.status, 200);
  assert.equal(
    (await user.request('/api/session')).data.user.email,
    'roman@example.test',
  );
  assert.notEqual(user.cookie, oldCookie);
});

test('authentication, same-origin and CSRF are required before private mutations', async (t) => {
  const { client } = await setup(t);
  const user = client();
  for (const path of ['/api/reflections', '/api/patterns', '/api/export']) {
    assert.equal((await user.request(path)).status, 401);
  }
  const crossOrigin = await user.request('/api/auth/register', {
    method: 'POST',
    headers: { Origin: 'https://attacker.example' },
    body: { name: 'Roman', email: 'roman@example.test', password },
  });
  assert.equal(crossOrigin.status, 403);
  await user.register();
  for (const headers of [
    { 'X-CSRF-Token': '' },
    { 'X-CSRF-Token': 'forged' },
    { Origin: 'https://attacker.example' },
  ]) {
    const denied = await user.request('/api/reflections', {
      method: 'POST',
      headers,
      body: reflectionInput,
    });
    assert.equal(denied.status, 403);
  }
  assert.deepEqual(
    (await user.request('/api/reflections')).data.reflections,
    [],
  );
});

test('structured reflection, explicit memory consent and editable pattern lifecycle', async (t) => {
  const { client } = await setup(t);
  const user = client();
  await user.register();
  const reflection = await user.reflect();
  assert.ok(reflection.id);
  assert.ok(reflection.createdAt);
  assert.equal(reflection.result.source, 'guided');
  assert.equal(reflection.result.safety.active, false);
  assert.ok(reflection.result.hypotheses.length > 0);
  assert.ok(reflection.result.memory_candidates.length > 0);
  assert.deepEqual((await user.request('/api/patterns')).data.patterns, []);
  assert.equal(
    (await user.request('/api/reflections')).data.reflections.length,
    1,
  );

  const pattern = await user.savePattern(reflection.id);
  assert.equal(pattern.status, 'hypothesis');
  for (const status of [
    'confirmed',
    'partially_confirmed',
    'rejected',
    'hypothesis',
  ]) {
    const changed = await user.request(`/api/patterns/${pattern.id}`, {
      method: 'PATCH',
      body: { status },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.pattern.status, status);
  }
  assert.equal(
    (
      await user.request(`/api/patterns/${pattern.id}`, {
        method: 'PATCH',
        body: { status: 'diagnosed' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await user.request(`/api/patterns/${pattern.id}`, {
        method: 'DELETE',
        body: {},
      })
    ).status,
    204,
  );
  assert.deepEqual((await user.request('/api/patterns')).data.patterns, []);
  assert.equal(
    (
      await user.request(`/api/reflections/${reflection.id}`, {
        method: 'DELETE',
        body: {},
      })
    ).status,
    204,
  );
  assert.deepEqual(
    (await user.request('/api/reflections')).data.reflections,
    [],
  );
});

test('crisis screening stops normal analysis and persistence, including non-situation fields', async (t) => {
  const { client } = await setup(t);
  const user = client();
  await user.register();
  for (const text of ['Ich will mich umbringen', 'I want to kill myself']) {
    const screened = await user.request('/api/safety', {
      method: 'POST',
      body: { text },
    });
    assert.equal(screened.status, 200);
    assert.equal(screened.data.safety.active, true);
    const blocked = await user.request('/api/reflections', {
      method: 'POST',
      body: { ...reflectionInput, thought: text },
    });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.data.safety.active, true);
    assert.equal(blocked.data.reflection, undefined);
  }
  assert.deepEqual(
    (await user.request('/api/reflections')).data.reflections,
    [],
  );
  assert.deepEqual((await user.request('/api/patterns')).data.patterns, []);
});

test('one user cannot read, save, update or delete another user’s data', async (t) => {
  const { client } = await setup(t);
  const owner = client();
  const other = client();
  await owner.register('owner@example.test');
  await other.register('other@example.test');
  const reflection = await owner.reflect();
  const pattern = await owner.savePattern(reflection.id);
  assert.deepEqual(
    (await other.request('/api/reflections')).data.reflections,
    [],
  );
  assert.deepEqual((await other.request('/api/patterns')).data.patterns, []);
  for (const [path, method, body] of [
    [
      '/api/patterns',
      'POST',
      { reflectionId: reflection.id, candidateIndex: 0 },
    ],
    [`/api/patterns/${pattern.id}`, 'PATCH', { status: 'confirmed' }],
    [`/api/patterns/${pattern.id}`, 'DELETE', {}],
    [`/api/reflections/${reflection.id}`, 'DELETE', {}],
  ]) {
    assert.equal((await other.request(path, { method, body })).status, 404);
  }
  const exported = await other.request('/api/export');
  assert.deepEqual(exported.data.reflections, []);
  assert.deepEqual(exported.data.patterns, []);
  assert.equal(
    (await owner.request('/api/reflections')).data.reflections.length,
    1,
  );
  assert.equal((await owner.request('/api/patterns')).data.patterns.length, 1);
});

test('SQL-like and HTML-like strings remain data; exports exclude authentication secrets', async (t) => {
  const { client } = await setup(t);
  const user = client();
  await user.register();
  const situation = `Robert'); DROP TABLE users; -- <script>alert('xss')</script>`;
  await user.reflect({ situation });
  const exported = await user.request('/api/export');
  assert.equal(exported.status, 200);
  assert.equal(exported.data.user.email, 'roman@example.test');
  assert.equal(exported.data.reflections[0].situation, situation);
  const json = JSON.stringify(exported.data);
  assert.doesNotMatch(
    json,
    /password|password_hash|session_hash|csrfToken|scrypt/i,
  );
  assert.doesNotMatch(json, /A-long-test-password-42/);
  assert.equal(
    (await user.request('/api/session')).data.user.email,
    'roman@example.test',
  );
});

test('account deletion requires password, revokes sessions and removes personal records', async (t) => {
  const { client } = await setup(t);
  const user = client();
  await user.register();
  const reflection = await user.reflect();
  await user.savePattern(reflection.id);
  const secondSession = client();
  const login = await secondSession.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'roman@example.test', password },
  });
  assert.equal(login.status, 200);
  const denied = await user.request('/api/account', {
    method: 'DELETE',
    body: { password: 'wrong-password' },
  });
  assert.ok(denied.status >= 400 && denied.status < 500);
  assert.equal(
    (await user.request('/api/reflections')).data.reflections.length,
    1,
  );
  assert.equal(
    (
      await user.request('/api/account', {
        method: 'DELETE',
        body: { password },
      })
    ).status,
    204,
  );
  assert.equal((await secondSession.request('/api/session')).data.user, null);
  assert.equal((await secondSession.request('/api/reflections')).status, 401);
  await user.register();
  const exported = await user.request('/api/export');
  assert.deepEqual(exported.data.reflections, []);
  assert.deepEqual(exported.data.patterns, []);
});

test('malformed, missing, out-of-range and oversized input is rejected', async (t) => {
  const { client } = await setup(t);
  const user = client();
  for (const body of [
    { name: 'Roman', email: 'not-an-email', password },
    { name: 'Roman', email: 'roman@example.test', password: 'short' },
    { name: '', email: 'roman@example.test', password },
  ]) {
    assert.equal(
      (await user.request('/api/auth/register', { method: 'POST', body }))
        .status,
      400,
    );
  }
  await user.register();
  assert.equal(
    (
      await user.request('/api/auth/register', {
        method: 'POST',
        body: { name: 'Other', email: 'roman@example.test', password },
      })
    ).status,
    409,
  );
  for (const patch of [
    { situation: '' },
    { thought: [] },
    { counterCheck: '' },
    { strategy: '' },
    { mood: 0 },
    { mood: 6 },
    { mood: 2.5 },
    { mood: '3' },
  ]) {
    const invalid = await user.request('/api/reflections', {
      method: 'POST',
      body: { ...reflectionInput, ...patch },
    });
    assert.equal(invalid.status, 400, JSON.stringify(patch));
  }
  assert.equal(
    (
      await user.request('/api/reflections', {
        method: 'POST',
        raw: '{invalid json',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await user.request('/api/reflections', {
        method: 'POST',
        body: { ...reflectionInput, situation: 'x'.repeat(1_100_000) },
      })
    ).status,
    413,
  );
  assert.deepEqual(
    (await user.request('/api/reflections')).data.reflections,
    [],
  );
});
