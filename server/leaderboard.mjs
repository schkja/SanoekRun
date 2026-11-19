/**
 * SanökRun leaderboard: the rules and the storage, shared by the Vercel
 * Functions in api/ (scores.mjs, health.mjs, prune.mjs).
 *
 *   GET  /api/scores?period=all|today&device=<id>   → the top 100
 *   POST /api/scores                                → submit a run
 *   GET  /api/health                                → { ok: true }
 *
 * Runs are kept in an Upstash Redis database (connected to the Vercel project
 * through the Marketplace, which sets KV_REST_API_URL and KV_REST_API_TOKEN).
 * The whole board is one JSON value; every change runs as one Lua script
 * inside Redis, so two runs sent at the same moment can't overwrite each other.
 *
 * No personal data is stored: only the nickname a player chooses, a random
 * device id their browser made up, and the run itself.
 */

import { Redis } from '@upstash/redis';
import { createHash, randomBytes } from 'node:crypto';

const KEY = 'scores';
const KEEP_ALL_TIME = 500;
const KEEP_TODAY = 500;
const SHOW = 100;

/** Fastest possible running speed in the game (metres per second), plus margin. */
const MAX_SPEED = 24 * 1.08;
const CHARACTERS = new Set(['glitch', 'lumberjack', 'squirrel', 'bear', 'hare', 'wolf']);

// A short list of words a kids' game shouldn't show. Matched inside names, ignoring case.
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigg', 'fag', 'whore', 'slut', 'porn', 'sex', 'nazi', 'hitler',
  'fick', 'scheiß', 'scheiss', 'hure', 'fotze', 'wichser', 'arsch',
  'хуй', 'хуё', 'хуе', 'пизд', 'бляд', 'блят', 'ебат', 'ебан', 'сука', 'мудак', 'пидор', 'гандон', 'залуп', 'шлюх',
  'хуї', 'пізд', 'їбат', 'курва',
  'puta', 'puto', 'mierda', 'coño', 'cabrón', 'cabron', 'polla', 'joder', 'maricón', 'maricon',
];

/** Today's date in Germany, YYYY-MM-DD. */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let client = null;
function redis() {
  // automaticDeserialization off: the board travels as a JSON string.
  client ??= Redis.fromEnv({ automaticDeserialization: false });
  return client;
}

/**
 * Add a run (or keep the better one for the same device, name and day), then
 * keep only the all-time best and today's best. With an empty run it only
 * tidies up. Returns the stored board as JSON.
 */
const UPDATE = `
local raw = redis.call('GET', KEYS[1])
local entries = {}
if raw then entries = cjson.decode(raw) end
local day = ARGV[1]
local keepAll = tonumber(ARGV[2])
local keepToday = tonumber(ARGV[3])
if ARGV[4] ~= '' then
  local run = cjson.decode(ARGV[4])
  local found = false
  for _, e in ipairs(entries) do
    if e.device == run.device and e.name == run.name and e.date == run.date then
      found = true
      if run.distance > e.distance then
        e.distance = run.distance
        e.coins = run.coins
        e.durationMs = run.durationMs
        e.character = run.character
        e.at = run.at
      end
      break
    end
  end
  if not found then table.insert(entries, run) end
end
table.sort(entries, function(a, b)
  if a.distance ~= b.distance then return a.distance > b.distance end
  return a.at < b.at
end)
local kept = {}
local todays = 0
for i, e in ipairs(entries) do
  local isToday = e.date == day
  if i <= keepAll or (isToday and todays < keepToday) then
    table.insert(kept, e)
    if isToday then todays = todays + 1 end
  end
end
local out = '[]'
if #kept > 0 then out = cjson.encode(kept) end
redis.call('SET', KEYS[1], out)
return out
`;

function parse(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function update(run) {
  const raw = await redis().eval(UPDATE, [KEY], [today(), String(KEEP_ALL_TIME), String(KEEP_TODAY), run ? JSON.stringify(run) : '']);
  return parse(raw);
}

/** Drop yesterday's runs that didn't make the all-time board (daily cron). */
export async function prune() {
  return (await update(null)).length;
}

/** Replace the whole board (used once, to import the old server's scores.json). */
export async function importEntries(entries) {
  await redis().set(KEY, JSON.stringify(entries));
  return prune();
}

export async function health() {
  return (await redis().ping()) === 'PONG';
}

const byDistance = (a, b) => b.distance - a.distance || a.at - b.at;

/** The board as players see it: all-time best plus today's, like the stored one after a prune. */
function list(entries, period) {
  const day = today();
  const sorted = [...entries].sort(byDistance);
  if (period === 'today') return sorted.filter((e) => e.date === day).slice(0, KEEP_TODAY);
  return sorted.slice(0, KEEP_ALL_TIME);
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
  if (/[\p{Cc}\p{Co}\p{Cn}​‎‏‪-‮⁦-⁩<>]/u.test(name)) return null;
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

/**
 * Per-device and per-address limits: at most 40 runs an hour, and 8 seconds
 * between runs. The counters expire on their own after at most an hour.
 */
async function rateLimited(keys) {
  const p = redis().pipeline();
  for (const key of keys) {
    p.incr(`rl:h:${key}`);
    p.expire(`rl:h:${key}`, 3600, 'NX');
    p.set(`rl:g:${key}`, '1', { nx: true, ex: 8 });
  }
  const results = await p.exec();
  return keys.some((_, i) => Number(results[i * 3]) > 40 || results[i * 3 + 2] === null);
}

/**
 * The address is only used for rate limiting, as a hash with a random salt
 * that changes every day. The address itself is never stored.
 */
async function addressHash(request) {
  const rawIp = String(request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '').split(',')[0].trim();
  const saltKey = `salt:${today()}`;
  const p = redis().pipeline();
  p.set(saltKey, randomBytes(16).toString('hex'), { nx: true, ex: 2 * 86_400 });
  p.get(saltKey);
  const [, salt] = await p.exec();
  return createHash('sha256').update(String(salt) + rawIp).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export function send(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function publicEntry(e, index, device) {
  return { rank: index + 1, name: e.name, character: e.character, distance: e.distance, mine: device ? e.device === device : false };
}

export async function getScores(request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') === 'today' ? 'today' : 'all';
    const device = url.searchParams.get('device') ?? '';
    const all = list(parse(await redis().get(KEY)), period);
    return send(200, {
      period,
      total: all.length,
      entries: all.slice(0, SHOW).map((e, i) => publicEntry(e, i, device)),
      // Lowest distance that still makes the board, so the game can tell whether to ask for a name.
      cutoff: all.length >= KEEP_ALL_TIME ? all[KEEP_ALL_TIME - 1].distance : 0,
    });
  } catch {
    return send(503, { error: 'unavailable' });
  }
}

export async function postScore(request) {
  let body;
  try {
    const text = await request.text();
    if (text.length > 4_000) return send(400, { error: 'bad-request' });
    body = JSON.parse(text);
  } catch {
    return send(400, { error: 'bad-request' });
  }
  if (!body || typeof body !== 'object') return send(400, { error: 'bad-request' });
  const name = cleanName(body.name);
  if (!name) return send(400, { error: 'name' });
  if (!CHARACTERS.has(body.character)) return send(400, { error: 'character' });
  const device = typeof body.device === 'string' ? body.device.slice(0, 64) : '';
  if (!device) return send(400, { error: 'device' });
  const run = { distance: Math.floor(body.distance), coins: Math.floor(body.coins), durationMs: Math.floor(body.durationMs) };
  if (!plausible(run)) return send(422, { error: 'run' });

  try {
    const ip = await addressHash(request);
    if (await rateLimited([`d:${device}`, `ip:${ip}`])) return send(429, { error: 'slow-down' });

    const entries = await update({ name, character: body.character, device, date: today(), at: Date.now(), ...run });
    const rankOf = (period) => list(entries, period).findIndex((e) => e.device === device && e.name === name && e.distance >= run.distance) + 1;
    return send(200, { ok: true, rank: rankOf('all'), rankToday: rankOf('today') });
  } catch {
    return send(503, { error: 'unavailable' });
  }
}
