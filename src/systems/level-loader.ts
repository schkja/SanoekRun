/**
 * The level loader: turns a JSON level definition into live entities.
 *
 * This is the bridge between `content/` (data you edit) and `src/entities/`
 * (code that runs). If you add a new kind of thing to the level format, you add
 * one loop here and nothing else changes.
 */

import * as THREE from 'three';
import { Platform } from '../entities/platform';
import { Pickup } from '../entities/pickup';
import { Enemy } from '../entities/enemy';
import { Goal } from '../entities/goal';
import { Player } from '../entities/player';
import itemsData from '../../content/items.json';
import enemiesData from '../../content/enemies.json';
import type { World } from './world';
import type { EnemyDef, ItemDef, LevelDef, Vec3 } from '../core/types';

/** Item and enemy definitions, indexed by id for fast lookup. */
const ITEMS = new Map<string, ItemDef>((itemsData as ItemDef[]).map((item) => [item.id, item]));
const ENEMIES = new Map<string, EnemyDef>((enemiesData as EnemyDef[]).map((e) => [e.id, e]));

export interface LoadedLevel {
  player: Player;
  goal: Goal;
  /** How many score-giving pickups exist — the HUD shows "x / total". */
  totalCoins: number;
  /** How many are needed before the portal opens. */
  requiredCoins: number;
}

export function loadLevel(world: World, level: LevelDef): LoadedLevel {
  world.clear();
  world.killY = level.killY ?? -20;

  // --- Platforms -----------------------------------------------------------
  for (const def of level.platforms) {
    world.add(new Platform(world, def));
  }

  // --- Pickups -------------------------------------------------------------
  let totalCoins = 0;
  for (const placement of level.pickups ?? []) {
    const def = ITEMS.get(placement.item);
    if (!def) {
      console.warn(`[level] Unknown item "${placement.item}" in "${level.name}". Skipped.`);
      continue;
    }

    for (const position of expandRepeat(placement.position, placement.repeat)) {
      world.add(new Pickup(world, def, position));
      if (def.effect === 'score') totalCoins++;
    }
  }

  // --- Enemies -------------------------------------------------------------
  for (const placement of level.enemies ?? []) {
    const def = ENEMIES.get(placement.enemy);
    if (!def) {
      console.warn(`[level] Unknown enemy "${placement.enemy}" in "${level.name}". Skipped.`);
      continue;
    }
    world.add(new Enemy(world, def, placement));
  }

  // --- Player and goal -----------------------------------------------------
  const player = world.add(new Player(world, new THREE.Vector3(...level.spawn)));
  world.player = player;

  const requiredCoins = Math.min(level.goal.requires ?? 0, totalCoins);
  const goal = world.add(new Goal(world, new THREE.Vector3(...level.goal.position), requiredCoins));
  goal.setCollected(0);

  return { player, goal, totalCoins, requiredCoins };
}

/**
 * `repeat` places several copies evenly between two points — how a row of coins
 * is written as three lines of JSON instead of twenty.
 */
function expandRepeat(
  start: Vec3,
  repeat: { count: number; to: Vec3 } | undefined,
): THREE.Vector3[] {
  const from = new THREE.Vector3(...start);
  if (!repeat || repeat.count <= 1) return [from];

  const to = new THREE.Vector3(...repeat.to);
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < repeat.count; i++) {
    positions.push(new THREE.Vector3().lerpVectors(from, to, i / (repeat.count - 1)));
  }
  return positions;
}
