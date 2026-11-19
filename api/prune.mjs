// Daily cron (vercel.json): drop yesterday's runs that didn't make the all-time board.
import { prune, send } from '../server/leaderboard.mjs';

export async function GET(request) {
  // Vercel sends the CRON_SECRET as a bearer token when one is set for the project.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return send(401, { error: 'unauthorized' });
  try {
    return send(200, { ok: true, kept: await prune() });
  } catch {
    return send(503, { ok: false });
  }
}
