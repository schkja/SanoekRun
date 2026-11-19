// GET /api/scores (the board) and POST /api/scores (submit a run). Logic in server/leaderboard.mjs.
import { getScores, postScore } from '../server/leaderboard.mjs';

export const GET = getScores;
export const POST = postScore;
