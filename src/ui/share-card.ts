/**
 * Share card: a picture of your run, sized for Instagram (4:5), stories and
 * WhatsApp. It uses a snapshot of the game's last frame as the background,
 * then prints the distance, the world you reached and a challenge.
 *
 * On phones, `shareRun` opens the system share sheet with the image attached.
 * Where that isn't possible (most desktops), it downloads the image instead.
 */

import { GAME_NAME, SHARE_URL } from '../game/settings';

export interface RunSummary {
  distance: number;
  coins: number;
  /** "coins" or "nuts" — whatever the character collects. */
  collectibleName: string;
  world: string;
  newBest: boolean;
}

const W = 1080;
const H = 1350;
const FONT = "'Trebuchet MS', 'Segoe UI', system-ui, -apple-system, sans-serif";

export function drawShareCard(run: RunSummary, snapshot: CanvasImageSource | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;

  g.fillStyle = '#123b2e';
  g.fillRect(0, 0, W, H);

  // The game's last frame, cropped to fill the card.
  if (snapshot) {
    const src = snapshot as HTMLCanvasElement;
    const sw = src.width || W;
    const sh = src.height || H;
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    try {
      g.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch {
      // A blank snapshot just leaves the plain background.
    }
  }

  // Darken the top and bottom so the text always reads.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(8, 10, 20, 0.82)');
  shade.addColorStop(0.42, 'rgba(8, 10, 20, 0.15)');
  shade.addColorStop(0.62, 'rgba(8, 10, 20, 0.2)');
  shade.addColorStop(1, 'rgba(8, 10, 20, 0.9)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  pill(g, W / 2, 110, GAME_NAME, '#5ce1a0', '#04342c', 44);

  g.fillStyle = '#ffffff';
  g.font = `900 190px ${FONT}`;
  g.fillText(`${Math.floor(run.distance).toLocaleString('en-US')} m`, W / 2, 360);

  g.font = `700 48px ${FONT}`;
  g.fillStyle = '#ffd23f';
  g.fillText(`Reached the ${run.world} · ${run.coins} ${run.collectibleName}`, W / 2, 440);

  if (run.newBest) pill(g, W / 2, 530, 'New personal best', '#ff5c7a', '#ffffff', 38);

  pill(g, W / 2, H - 230, 'Can you beat me?', '#ffd23f', '#3a2a00', 64);
  g.font = `700 40px ${FONT}`;
  g.fillStyle = '#ffffff';
  g.fillText(SHARE_URL.replace(/^https?:\/\//, ''), W / 2, H - 110);

  return canvas;
}

function pill(g: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string, size: number): void {
  g.font = `800 ${size}px ${FONT}`;
  const width = g.measureText(text).width + size * 1.3;
  const height = size * 1.7;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
  g.fill();
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.fillText(text, x, y + size * 0.05);
  g.textBaseline = 'alphabetic';
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

export async function shareRun(card: HTMLCanvasElement, run: RunSummary): Promise<ShareResult> {
  const blob = await new Promise<Blob | null>((resolve) => card.toBlob(resolve, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], 'sanoekrun.png', { type: 'image/png' });
  const text = `I ran ${Math.floor(run.distance)} m in ${GAME_NAME}. Can you beat me? ${SHARE_URL}`;

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title: GAME_NAME });
      return 'shared';
    }
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
  }

  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sanoekrun.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
