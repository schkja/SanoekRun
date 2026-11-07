/**
 * Talking to the leaderboard server (server/index.mjs) at /api on the same site.
 * Everything here fails quietly: with no server (a preview, offline), the game
 * just doesn't offer the leaderboard.
 */

import type { Character } from './settings';

export interface BoardEntry {
  rank: number;
  name: string;
  character: Character;
  distance: number;
  mine: boolean;
}

export interface Board {
  entries: BoardEntry[];
  total: number;
  cutoff: number;
}

export type Period = 'all' | 'today';

const BASE = './api/scores';

async function call<T>(input: string, init?: RequestInit): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    const res = await fetch(input, { ...init, signal: controller.signal });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchBoard(period: Period, device: string): Promise<Board | null> {
  return call<Board>(`${BASE}?period=${period}&device=${encodeURIComponent(device)}`);
}

export interface SubmitResult {
  ok: boolean;
  rank?: number;
  rankToday?: number;
  /** 'name' when the nickname wasn't accepted. */
  error?: string;
}

export async function submitRun(run: {
  name: string;
  character: Character;
  device: string;
  distance: number;
  coins: number;
  durationMs: number;
}): Promise<SubmitResult> {
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(run),
    });
    const body = (await res.json()) as SubmitResult;
    return res.ok ? { ...body, ok: true } : { ok: false, error: body.error };
  } catch {
    return { ok: false, error: 'offline' };
  }
}
