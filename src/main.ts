/**
 * Entry point. Finds the two containers in index.html and starts the game.
 * Everything interesting happens in src/core/game.ts.
 */

import { Game } from './core/game';

const canvasContainer = document.getElementById('game');
const uiContainer = document.getElementById('ui');

if (!canvasContainer || !uiContainer) {
  throw new Error('Missing #game or #ui in index.html');
}

const game = new Game(canvasContainer, uiContainer);
game.start();

// Handy while developing: `game` is reachable from the browser console.
declare global {
  interface Window {
    game: Game;
  }
}
window.game = game;
