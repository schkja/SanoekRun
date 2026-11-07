/**
 * The share picture: a tall 9:16 image made for TikTok, Instagram Stories and
 * WhatsApp status.
 *
 * Built like a comic panel: the last frame of your run as the background, a
 * yellow "BOOM" burst behind your distance, your hero's face, and a challenge
 * at the bottom. The big number is the thing people scroll past and stop for.
 *
 * On phones, `shareRun` opens the system share sheet with the image attached.
 * Where that isn't possible (most desktops), it downloads the image instead.
 */

import { GAME_NAME, SHARE_URL, type Character } from '../game/settings';
import { formatNumber, t } from '../i18n';
import { PORTRAITS } from './portraits';
import { ICON_SVG, svgImage } from './logo';
import qrcode from 'qrcode-generator';

export interface RunSummary {
  distance: number;
  coins: number;
  /** What the character collects. */
  collectible: 'coins' | 'nuts' | 'honey';
  character: Character;
  world: string;
  newBest: boolean;
}

const W = 1080;
const H = 1920;
const INK = '#1f2a44';
const FONT = "'Lilita One', 'Rubik', 'Trebuchet MS', system-ui, sans-serif";

export async function drawShareCard(run: RunSummary, snapshot: HTMLCanvasElement | null): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const [portrait, icon] = await Promise.all([svgImage(PORTRAITS[run.character]), svgImage(ICON_SVG)]);
  try {
    await document.fonts?.load(`80px 'Lilita One'`);
  } catch {
    // Drawn with the fallback font then.
  }

  // Background: the last frame of the run, cropped to fill, or a sky.
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#4fb8ff');
  sky.addColorStop(1, '#bfe9ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  if (snapshot && snapshot.width) {
    const scale = Math.max(W / snapshot.width, H / snapshot.height);
    const dw = snapshot.width * scale;
    const dh = snapshot.height * scale;
    g.drawImage(snapshot, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(20, 30, 60, 0.55)');
  shade.addColorStop(0.3, 'rgba(20, 30, 60, 0.1)');
  shade.addColorStop(0.62, 'rgba(20, 30, 60, 0.15)');
  shade.addColorStop(1, 'rgba(20, 30, 60, 0.75)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);

  // Instagram and TikTok cover roughly the top 250 px and the bottom 300 px
  // with their own buttons, so everything that matters sits between.

  // Top: icon and name.
  if (icon) g.drawImage(icon, 70, 235, 130, 130);
  g.textAlign = 'left';
  outlined(g, GAME_NAME, 225, 330, 86, '#ffc93c', 14);

  // The burst behind the number.
  burst(g, W / 2, 760, 460, 300, 18);
  g.textAlign = 'center';
  const headline = t(`share.headline.${run.character}`);
  outlined(g, headline, W / 2, 610, fitSize(g, headline, 62, W - 160), '#ffffff', 12);
  const number = `${formatNumber(run.distance)} ${t('hud.unit')}`;
  outlined(g, number, W / 2, 830, fitSize(g, number, 210, W - 220), '#ffffff', 24);

  // What happened.
  const items = t(run.collectible === 'nuts' ? 'share.nuts' : run.collectible === 'honey' ? 'share.honey' : 'share.coins');
  const line = t('share.reached', { world: run.world, n: run.coins, items });
  outlined(g, line, W / 2, 1035, fitSize(g, line, 58, W - 160), '#ffc93c', 12);

  // The hero.
  if (portrait) {
    g.save();
    g.translate(W / 2, 1215);
    g.rotate(0.08);
    g.fillStyle = '#ffffff';
    g.strokeStyle = INK;
    g.lineWidth = 14;
    g.beginPath();
    g.arc(0, 0, 140, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.drawImage(portrait, -130, -130, 260, 260);
    g.restore();
  }
  if (run.newBest) sticker(g, W / 2 + 230, 1120, t('share.newBest'), '#ff5c7a', 0.12);

  // The challenge, and how to get to the game: a QR code anyone can scan
  // from the screen, plus the address in big letters.
  g.textAlign = 'center';
  pill(g, W / 2, 1420, t('share.challenge'), '#4fd07a', '#ffffff', 76);
  drawQr(g, SHARE_URL, 110, 1500, 220);
  g.textAlign = 'left';
  outlined(g, t('share.play'), 370, 1575, fitSize(g, t('share.play'), 56, 600), '#ffc93c', 10);
  const address = SHARE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  outlined(g, address, 370, 1660, fitSize(g, address, 44, 620), '#ffffff', 8);

  return canvas;
}

/** A QR code on a white rounded card with an ink border. */
function drawQr(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const pad = 16;
  g.fillStyle = '#ffffff';
  g.strokeStyle = INK;
  g.lineWidth = 10;
  g.beginPath();
  g.roundRect(x, y, size, size, 24);
  g.fill();
  g.stroke();
  const cell = (size - pad * 2) / n;
  g.fillStyle = INK;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) g.fillRect(x + pad + c * cell, y + pad + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
}

/** Text with a thick cartoon outline. */
function outlined(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, stroke: number): void {
  g.font = `${size}px ${FONT}`;
  g.lineJoin = 'round';
  g.lineWidth = stroke;
  g.strokeStyle = INK;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function fitSize(g: CanvasRenderingContext2D, text: string, size: number, maxWidth: number): number {
  let s = size;
  g.font = `${s}px ${FONT}`;
  while (g.measureText(text).width > maxWidth && s > 24) {
    s -= 4;
    g.font = `${s}px ${FONT}`;
  }
  return s;
}

/** A spiky comic "BOOM" shape. */
function burst(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, spikes: number): void {
  g.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const k = i % 2 === 0 ? 1 : 0.72;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = '#ffc93c';
  g.fill();
  g.lineWidth = 16;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.stroke();
}

function pill(g: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string, size: number): void {
  const s = fitSize(g, text, size, W - 260);
  g.font = `${s}px ${FONT}`;
  const width = g.measureText(text).width + s * 1.4;
  const height = s * 1.7;
  g.fillStyle = INK;
  g.beginPath();
  g.roundRect(x - width / 2, y - height / 2 + 14, width, height, height / 2);
  g.fill();
  g.fillStyle = bg;
  g.lineWidth = 12;
  g.strokeStyle = INK;
  g.beginPath();
  g.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
  g.fill();
  g.stroke();
  g.textBaseline = 'middle';
  outlined(g, text, x, y + s * 0.05, s, fg, 10);
  g.textBaseline = 'alphabetic';
}

function sticker(g: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, angle: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.font = `48px ${FONT}`;
  const width = g.measureText(text).width + 60;
  g.fillStyle = bg;
  g.strokeStyle = INK;
  g.lineWidth = 10;
  g.beginPath();
  g.roundRect(-width / 2, -42, width, 84, 20);
  g.fill();
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  outlined(g, text, 0, 4, 48, '#ffffff', 8);
  g.restore();
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

export async function shareRun(card: HTMLCanvasElement, run: RunSummary): Promise<ShareResult> {
  // Instagram and TikTok drop any text or link sent with a picture, so put the
  // link on the clipboard too: in a Story, the Link sticker can paste it.
  // (This must happen first, while the tap still counts as a user action.)
  try {
    await navigator.clipboard?.writeText(SHARE_URL);
  } catch {
    // No clipboard here; the address and QR code are on the picture anyway.
  }
  const blob = await new Promise<Blob | null>((resolve) => card.toBlob(resolve, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], 'sanoekrun.png', { type: 'image/png' });
  const text = t('share.text', { m: run.distance, game: GAME_NAME, url: SHARE_URL });

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
