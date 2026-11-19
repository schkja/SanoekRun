/**
 * One-time move of the old server's leaderboard into the Vercel database.
 *
 *   1. Copy the old file from the Hetzner server, e.g.
 *        docker cp sanoekrun-api:/data/scores.json ./scores.json
 *   2. Get the database keys:  npx vercel env pull .env.local
 *   3. node --env-file=.env.local scripts/import-scores.mjs scores.json
 *
 * This replaces whatever is in the database now.
 */

import { readFileSync } from 'node:fs';
import { importEntries } from '../server/leaderboard.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node --env-file=.env.local scripts/import-scores.mjs scores.json');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
const entries = Array.isArray(data.entries) ? data.entries : [];
const kept = await importEntries(entries);
console.log(`Imported ${entries.length} runs, ${kept} kept after tidying up.`);
