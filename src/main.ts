/**
 * Entry point. Finds the two containers in index.html and starts the game.
 * Everything interesting happens in src/game/game.ts.
 */

// Fonts are bundled with the game (no outside requests), so they also work offline.
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
// Cyrillic letters (Russian, Ukrainian): Nunito has them; Rubik stands in for the display font.
import '@fontsource/nunito/cyrillic-700.css';
import '@fontsource/nunito/cyrillic-800.css';
import '@fontsource/rubik/cyrillic-800.css';
import { Game } from './game/game';

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

// Offline support and "add to home screen". Only on a real site (https or
// localhost); skipped in previews where service workers aren't allowed.
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
