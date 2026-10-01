import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { openStore } from '../database/store.js';
import { checkSafety } from '../safety/check.js';
import { reflect } from '../ai/reflection.js';

const scrypt = promisify(scryptCallback);
const ttl = 7 * 24 * 60 * 60 * 1000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const userView = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const field = (body, name, max = 4000) => {
  if (
    typeof body?.[name] !== 'string' ||
    !body[name].trim() ||
    body[name].length > max
  ) {
    throw fail(
      400,
      `Bitte das Feld „${name}“ gültig ausfüllen (max. ${max} Zeichen).`,
    );
  }
  return body[name].trim();
};
const passwordField = (body) => {
  const password = body?.password;
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  ) {
    throw fail(400, 'Das Passwort muss zwischen 12 und 128 Zeichen lang sein.');
  }
  return password;
};
const emailField = (body) => {
  const email = field(body, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw fail(400, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  return email;
};
async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}
async function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
// Use a fixed dummy hash to perform the same scrypt work for unknown accounts.
const dummyHash = `00000000000000000000000000000000:${'00'.repeat(64)}`;

export function createApp(options = {}) {
  const production = process.env.NODE_ENV === 'production';
  const origin = options.origin ?? process.env.PUBLIC_ORIGIN;
  if (production && (!origin || new URL(origin).protocol !== 'https:')) {
    throw new Error('Production requires an HTTPS PUBLIC_ORIGIN.');
  }
  if (origin && new URL(origin).origin !== origin)
    throw new Error(
      'PUBLIC_ORIGIN must be an exact origin without a path or trailing slash.',
    );
  const secureCookies = options.secureCookies ?? production;
  const cookieName = secureCookies ? '__Host-psyche_session' : 'psyche_session';
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'strict',
    path: '/',
  };
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model ?? process.env.OPENAI_MODEL;
  const aiAvailable = options.aiEnabled !== false && Boolean(apiKey && model);
  const db = openStore(
    options.dbPath ?? process.env.DATABASE_PATH ?? './data/psyche.sqlite',
  );
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const expectedOrigin = origin ?? `${req.protocol}://${req.get('host')}`;
    if (!origin && !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname))
      return next(
        fail(403, 'Für diesen Host muss PUBLIC_ORIGIN konfiguriert werden.'),
      );
    if (req.get('origin') !== expectedOrigin)
      return next(fail(403, 'Anfrage von einer nicht zugelassenen Seite.'));
    if (!req.is('application/json'))
      return next(fail(415, 'JSON-Anfrage erforderlich.'));
    next();
  });
  app.use(express.json({ limit: '40kb', strict: true }));
  if (options.rateLimit !== false) {
    app.use(
      '/api/auth',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: {
          error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.',
        },
      }),
    );
    app.use(
      '/api',
      rateLimit({
        windowMs: 60 * 1000,
        limit: 120,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Zu viele Anfragen. Bitte kurz warten.' },
      }),
    );
  }
  const tokenFrom = (req) => {
    const value = req.headers.cookie
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  };
  app.use('/api', (req, _res, next) => {
    const token = tokenFrom(req);
    if (token) {
      req.session = db
        .prepare(
          `SELECT s.*, u.id, u.name, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
        )
        .get(hash(token), Date.now());
    }
    next();
  });
  function newSession(req, res, user) {
    const previous = tokenFrom(req);
    if (previous)
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(previous));
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
      hash(token),
      user.id,
      csrfToken,
      Date.now() + ttl,
    );
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: ttl });
    return { user: userView(user), csrfToken, aiAvailable };
  }
  app.get('/api/session', (req, res) =>
    res.json({
      user: req.session ? userView(req.session) : null,
      csrfToken: req.session?.csrf_token ?? null,
      aiAvailable,
    }),
  );
  app.post('/api/auth/register', async (req, res) => {
    const name = field(req.body, 'name', 80);
    const email = emailField(req.body);
    const password = passwordField(req.body);
    const password_hash = await passwordHash(password);
    const user = { id: randomUUID(), name, email };
    try {
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(
        user.id,
        name,
        email,
        password_hash,
        new Date().toISOString(),
      );
    } catch (error) {
      if (
        error.code?.startsWith('ERR_SQLITE') &&
        db.prepare('SELECT id FROM users WHERE email=?').get(email)
      )
        throw fail(
          409,
          'Registrierung nicht möglich. Versuche, dich anzumelden.',
        );
      throw error;
    }
    res.status(201).json(newSession(req, res, user));
  });
  app.post('/api/auth/login', async (req, res) => {
    const email = emailField(req.body);
    const password = passwordField(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const matches = await passwordMatches(
      password,
      user?.password_hash ?? dummyHash,
    );
    if (!user || !matches)
      throw fail(401, 'E-Mail oder Passwort ist nicht korrekt.');
    res.json(newSession(req, res, user));
  });
  app.use('/api', (req, _res, next) => {
    if (!req.session) return next(fail(401, 'Bitte melde dich an.'));
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('x-csrf-token') !== req.session.csrf_token
    )
      return next(
        fail(
          403,
          'Sitzung konnte nicht bestätigt werden. Bitte lade die Seite neu.',
        ),
      );
    next();
  });
  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(
      req.session.token_hash,
    );
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  app.post('/api/safety', (req, res) =>
    res.json({ safety: checkSafety(field(req.body, 'text', 28000)) }),
  );
  const reflectionsFor = (userId) =>
    db
      .prepare(
        'SELECT * FROM reflections WHERE user_id=? ORDER BY created_at DESC, id DESC',
      )
      .all(userId)
      .map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        ...JSON.parse(row.body),
      }));
  const patternView = (row) => ({
    id: row.id,
    reflectionId: row.reflection_id,
    text: row.text,
    status: row.status,
    confidence: row.confidence,
    createdAt: row.created_at,
  });
  const patternsFor = (userId) =>
    db
      .prepare(
        'SELECT * FROM patterns WHERE user_id=? ORDER BY created_at DESC, id DESC',
      )
      .all(userId)
      .map(patternView);
  const ownedReflection = (req) => {
    const row = db
      .prepare('SELECT * FROM reflections WHERE id=? AND user_id=?')
      .get(req.params.id, req.session.user_id);
    if (!row) throw fail(404, 'Reflexion nicht gefunden.');
    return row;
  };
  const ownedPattern = (req) => {
    const row = db
      .prepare('SELECT * FROM patterns WHERE id=? AND user_id=?')
      .get(req.params.id, req.session.user_id);
    if (!row) throw fail(404, 'Erkenntnis nicht gefunden.');
    return row;
  };
  app.get('/api/reflections', (req, res) =>
    res.json({ reflections: reflectionsFor(req.session.user_id) }),
  );
  const inFlight = new Set();
  app.post('/api/reflections', async (req, res) => {
    const input = Object.fromEntries(
      [
        'situation',
        'thought',
        'emotion',
        'behavior',
        'consequence',
        'counterCheck',
        'strategy',
      ].map((key) => [key, field(req.body, key)]),
    );
    if (
      !Number.isInteger(req.body.mood) ||
      req.body.mood < 1 ||
      req.body.mood > 5 ||
      (req.body.useAi !== undefined && typeof req.body.useAi !== 'boolean')
    )
      throw fail(400, 'Ungültige Stimmung oder KI-Einstellung.');
    Object.assign(input, {
      mood: req.body.mood,
      useAi: req.body.useAi === true,
    });
    const safety = checkSafety(Object.values(input).join('\n'));
    if (safety.active) return res.json({ safety });
    const userId = req.session.user_id;
    if (inFlight.has(userId))
      throw fail(
        429,
        'Eine Reflexion wird bereits verarbeitet. Bitte warte kurz.',
      );
    inFlight.add(userId);
    try {
      const result = await reflect(input, {
        apiKey: aiAvailable ? apiKey : undefined,
        model,
        fetchImpl: options.fetchImpl,
      });
      if (result.safety.active) return res.json({ safety: result.safety });
      // A logout/account deletion during an AI request must prevent later persistence.
      if (
        !db
          .prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?')
          .get(req.session.token_hash, Date.now())
      )
        throw fail(401, 'Die Sitzung ist abgelaufen. Bitte melde dich neu an.');
      const reflection = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...input,
        result,
      };
      db.prepare('INSERT INTO reflections VALUES (?,?,?,?)').run(
        reflection.id,
        userId,
        reflection.createdAt,
        JSON.stringify({ ...input, result }),
      );
      res.status(201).json({ reflection });
    } finally {
      inFlight.delete(userId);
    }
  });
  app.delete('/api/reflections/:id', (req, res) => {
    ownedReflection(req);
    db.prepare('DELETE FROM reflections WHERE id=? AND user_id=?').run(
      req.params.id,
      req.session.user_id,
    );
    res.status(204).end();
  });
  app.get('/api/patterns', (req, res) =>
    res.json({ patterns: patternsFor(req.session.user_id) }),
  );
  app.post('/api/patterns', (req, res) => {
    const reflectionId = field(req.body, 'reflectionId', 100);
    const candidateIndex = req.body.candidateIndex;
    if (!Number.isInteger(candidateIndex) || candidateIndex < 0)
      throw fail(400, 'Ungültige Erkenntnis.');
    const reflection = db
      .prepare('SELECT * FROM reflections WHERE id=? AND user_id=?')
      .get(reflectionId, req.session.user_id);
    if (!reflection) throw fail(404, 'Reflexion nicht gefunden.');
    const result = JSON.parse(reflection.body).result;
    const candidate = result.memory_candidates[candidateIndex];
    if (!candidate || result.safety.active)
      throw fail(400, 'Diese Erkenntnis kann nicht übernommen werden.');
    const existing = db
      .prepare(
        'SELECT * FROM patterns WHERE user_id=? AND reflection_id=? AND candidate_index=?',
      )
      .get(req.session.user_id, reflectionId, candidateIndex);
    if (existing) return res.json({ pattern: patternView(existing) });
    const id = randomUUID();
    db.prepare('INSERT INTO patterns VALUES (?,?,?,?,?,?,?,?)').run(
      id,
      req.session.user_id,
      reflectionId,
      candidateIndex,
      candidate.text,
      'hypothesis',
      result.hypotheses[candidateIndex]?.confidence ?? 0,
      new Date().toISOString(),
    );
    res.status(201).json({
      pattern: patternView(
        db.prepare('SELECT * FROM patterns WHERE id=?').get(id),
      ),
    });
  });
  app.patch('/api/patterns/:id', (req, res) => {
    ownedPattern(req);
    const status = req.body?.status;
    if (
      !['hypothesis', 'confirmed', 'partially_confirmed', 'rejected'].includes(
        status,
      )
    )
      throw fail(400, 'Ungültiger Erkenntnisstatus.');
    db.prepare('UPDATE patterns SET status=? WHERE id=? AND user_id=?').run(
      status,
      req.params.id,
      req.session.user_id,
    );
    res.json({ pattern: patternView(ownedPattern(req)) });
  });
  app.delete('/api/patterns/:id', (req, res) => {
    ownedPattern(req);
    db.prepare('DELETE FROM patterns WHERE id=? AND user_id=?').run(
      req.params.id,
      req.session.user_id,
    );
    res.status(204).end();
  });
  app.get('/api/export', (req, res) =>
    res.attachment('psycheai-export.json').json({
      exportedAt: new Date().toISOString(),
      user: userView(req.session),
      reflections: reflectionsFor(req.session.user_id),
      patterns: patternsFor(req.session.user_id),
    }),
  );
  app.delete('/api/account', async (req, res) => {
    const password = passwordField(req.body);
    const user = db
      .prepare('SELECT * FROM users WHERE id=?')
      .get(req.session.user_id);
    if (!user || !(await passwordMatches(password, user.password_hash)))
      throw fail(401, 'Das Passwort ist nicht korrekt.');
    db.prepare('DELETE FROM users WHERE id=?').run(req.session.user_id);
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  app.use('/api', (_req, _res, next) =>
    next(fail(404, 'Endpunkt nicht gefunden.')),
  );
  app.use(
    express.static(fileURLToPath(new URL('../frontend/', import.meta.url)), {
      etag: true,
      maxAge: 0,
    }),
  );
  app.use((_req, res) =>
    res.status(404).type('text').send('Seite nicht gefunden.'),
  );
  app.use((error, _req, res, _next) => {
    const status =
      error.type === 'entity.too.large'
        ? 413
        : error.type === 'entity.parse.failed'
          ? 400
          : (error.status ?? 500);
    res.status(status).json({
      error:
        status === 500
          ? 'Die Anfrage konnte nicht verarbeitet werden. Bitte versuche es erneut.'
          : status === 413
            ? 'Die Eingabe ist zu lang.'
            : status === 400 && error.type
              ? 'Ungültiges JSON.'
              : error.message,
    });
  });
  return { app, db };
}
