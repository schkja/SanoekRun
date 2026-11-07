/**
 * SanökRun leaderboard server.
 *
 * A tiny HTTP API with no dependencies. It keeps the best runs in a JSON file
 * (500 all-time plus today's), checks that each submitted run is physically
 * possible, filters nicknames, and limits how often one device can submit.
 *
 *   GET  /api/scores?period=all|today&device=<id>   → the top 100
 *   POST /api/scores                                → submit a run
 *   GET  /api/health                                → "ok"
 *
 * No personal data is stored: only the nickname a player chooses, a random
 * device id their browser made up, and the run itself.
 */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_FILE = process.env.DATA_FILE ?? '/data/scores.json';
const KEEP_ALL_TIME = 500;
const KEEP_TODAY = 500;
const SHOW = 100;

/** Fastest possible running speed in the game (metres per second), plus margin. */
const MAX_SPEED = 24 * 1.08;
const CHARACTERS = new Set(['lumberjack', 'squirrel']);

// A short list of words a kids' game shouldn't show. Matched inside names, ignoring case.
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigg', 'fag', 'whore', 'slut', 'porn', 'sex', 'nazi', 'hitler',
  'fick', 'scheiß', 'scheiss', 'hure', 'fotze', 'wichser', 'arsch',
  'хуй', 'хуё', 'хуе', 'пизд', 'бляд', 'блят', 'ебат', 'ебан', 'сука', 'мудак', 'пидор', 'гандон', 'залуп', 'шлюх',
  'хуї', 'пізд', 'їбат', 'курва',
  'puta', 'puto', 'mierda', 'coño', 'cabrón', 'cabron', 'polla', 'joder', 'maricón', 'maricon',
];

/** Today's date in Germany, YYYY-MM-DD. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let entries = load();
let saveTimer = null;

function load() {
  try {
    const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify({ entries }));
    renameSync(tmp, DATA_FILE);
  }, 500);
}

const byDistance = (a, b) => b.distance - a.distance || a.at - b.at;

/** Keep the all-time best and everything from today; forget the rest. */
function prune() {
  entries.sort(byDistance);
  const day = today();
  const keep = new Set(entries.slice(0, KEEP_ALL_TIME));
  for (const e of entries.filter((e) => e.date === day).slice(0, KEEP_TODAY)) keep.add(e);
  entries = entries.filter((e) => keep.has(e));
}

function list(period) {
  const day = today();
  return entries.filter((e) => period !== 'today' || e.date === day).sort(byDistance);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * Any pseudonym players like: letters in any language, digits, emoji and
 * symbols, up to 16 characters. Only invisible/control characters and rude
 * words are refused.
 */
function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  if (length < 1 || length > 16) return null;
  // No control or invisible formatting characters (they can hide or flip text),
  // but keep the joiners emoji are built from.
  if (/[\p{Cc}\p{Co}\p{Cn}\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069<>]/u.test(name)) return null;
  const folded = name.toLowerCase().replace(/[^\p{L}]/gu, '');
  if (BLOCKED.some((word) => folded.includes(word))) return null;
  return name;
}

/** Is this run possible in the game? */
function plausible(run) {
  const { distance, coins, durationMs } = run;
  if (![distance, coins, durationMs].every((n) => Number.isFinite(n) && n >= 0)) return false;
  if (distance < 20 || distance > 200_000) return false;
  const seconds = durationMs / 1000;
  if (distance > seconds * MAX_SPEED + 30) return false;
  // There are at most a few coins per metre of track.
  if (coins > distance * 0.5 + 20) return false;
  return true;
}

// Per-device and per-address limits on how often runs can be sent.
const recent = new Map();
const IP_SALT = randomBytes(16).toString('hex');

function rateLimited(key) {
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (times.length >= 40 || (times.length && now - times[times.length - 1] < 8_000)) return true;
  times.push(now);
  recent.set(key, times);
  return false;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 4_000) reject(new Error('too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function publicEntry(e, index, device) {
  return { rank: index + 1, name: e.name, character: e.character, distance: e.distance, mine: device ? e.device === device : false };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // The address is only used for rate limiting, as a salted hash kept in
  // memory (new salt on every restart). It is never written to disk or logged.
  const rawIp = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const ip = createHash('sha256').update(IP_SALT + rawIp).digest('hex').slice(0, 16);

  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });

    if (url.pathname === '/api/scores' && req.method === 'GET') {
      const period = url.searchParams.get('period') === 'today' ? 'today' : 'all';
      const device = url.searchParams.get('device') ?? '';
      const all = list(period);
      return send(res, 200, {
        period,
        total: all.length,
        entries: all.slice(0, SHOW).map((e, i) => publicEntry(e, i, device)),
        // Lowest distance that still makes the board, so the game can tell whether to ask for a name.
        cutoff: all.length >= KEEP_ALL_TIME ? all[KEEP_ALL_TIME - 1].distance : 0,
      });
    }

    if (url.pathname === '/api/scores' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const name = cleanName(body.name);
      if (!name) return send(res, 400, { error: 'name' });
      if (!CHARACTERS.has(body.character)) return send(res, 400, { error: 'character' });
      const device = typeof body.device === 'string' ? body.device.slice(0, 64) : '';
      if (!device) return send(res, 400, { error: 'device' });
      const run = { distance: Math.floor(body.distance), coins: Math.floor(body.coins), durationMs: Math.floor(body.durationMs) };
      if (!plausible(run)) return send(res, 422, { error: 'run' });
      if (rateLimited(`d:${device}`) || rateLimited(`ip:${ip}`)) return send(res, 429, { error: 'slow-down' });

      const date = today();
      // One entry per device, name and day: keep the better run.
      const existing = entries.find((e) => e.device === device && e.name === name && e.date === date);
      if (existing) {
        if (run.distance > existing.distance) Object.assign(existing, run, { character: body.character, at: Date.now() });
      } else {
        entries.push({ name, character: body.character, device, date, at: Date.now(), ...run });
      }
      prune();
      save();
      const rankOf = (period) => list(period).findIndex((e) => e.device === device && e.name === name && e.distance >= run.distance) + 1;
      return send(res, 200, { ok: true, rank: rankOf('all'), rankToday: rankOf('today') });
    }

    send(res, 404, { error: 'not-found' });
  } catch {
    send(res, 400, { error: 'bad-request' });
  }
});

// Housekeeping every 10 minutes: drop yesterday's runs that didn't make the
// all-time board, and forget rate-limit entries older than an hour.
setInterval(() => {
  const before = entries.length;
  prune();
  if (entries.length !== before) save();
  const now = Date.now();
  for (const [key, times] of recent) if (!times.some((t) => now - t < 3_600_000)) recent.delete(key);
}, 600_000).unref();

server.listen(PORT, () => console.log(`[leaderboard] listening on ${PORT}, ${entries.length} runs stored`));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    clearTimeout(saveTimer);
    try {
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify({ entries }));
    } catch {}
    process.exit(0);
  });
}
