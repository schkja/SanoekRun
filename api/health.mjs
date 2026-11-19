// GET /api/health → { ok: true } when the database answers.
import { health, send } from '../server/leaderboard.mjs';

export async function GET() {
  try {
    return send((await health()) ? 200 : 503, { ok: true });
  } catch {
    return send(503, { ok: false });
  }
}
