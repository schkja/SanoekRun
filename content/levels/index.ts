/**
 * The level order.
 *
 * TO ADD A LEVEL:
 *   1. Copy any levelN.json in this folder to level4.json and edit it.
 *   2. Import it below and add it to the array.
 * That's the whole job — no other file needs to change.
 */

import level1 from './level1.json';
import level2 from './level2.json';
import level3 from './level3.json';
import type { LevelDef } from '../../src/core/types';

export const LEVELS: LevelDef[] = [level1, level2, level3] as LevelDef[];
