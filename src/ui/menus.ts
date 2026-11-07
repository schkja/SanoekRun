/**
 * Full-screen overlays: title, world intro, pause and the end-of-run screen.
 *
 * One class renders all of them from a small description object, so adding a
 * new screen is a matter of calling `show()` with different content.
 */

export interface MenuButton {
  label: string;
  onClick: () => void;
  /** Renders as the highlighted primary action. */
  primary?: boolean;
}

export interface MenuScreen {
  /** Small line above the title, e.g. "World 2". */
  eyebrow?: string;
  title: string;
  /** A big number under the title, e.g. the distance run. */
  hero?: string;
  /** A highlighted pill, e.g. "Only 37 m from your best". */
  badge?: string;
  body?: string;
  /** Rows of "label: value" shown as a results table. */
  stats?: Array<[string, string]>;
  buttons?: MenuButton[];
  /** Extra class for per-screen colour, e.g. 'is-gameover'. */
  variant?: string;
  /** Hide automatically after this many milliseconds. */
  autoHideMs?: number;
}

export class Menus {
  private readonly root: HTMLElement;
  private hideTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'menu is-hidden';
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('is-hidden');
  }

  show(screen: MenuScreen): void {
    window.clearTimeout(this.hideTimer);

    this.root.className = `menu ${screen.variant ?? ''}`;
    this.root.innerHTML = `
      <div class="menu-card">
        ${screen.eyebrow ? `<p class="menu-eyebrow">${escapeHtml(screen.eyebrow)}</p>` : ''}
        <h1 class="menu-title">${escapeHtml(screen.title)}</h1>
        ${screen.hero ? `<p class="menu-hero">${escapeHtml(screen.hero)}</p>` : ''}
        ${screen.badge ? `<p class="menu-badge">${escapeHtml(screen.badge)}</p>` : ''}
        ${screen.body ? `<p class="menu-body">${escapeHtml(screen.body)}</p>` : ''}
        ${renderStats(screen.stats)}
        <div class="menu-buttons"></div>
      </div>
    `;

    const buttonRow = this.root.querySelector<HTMLElement>('.menu-buttons')!;
    for (const button of screen.buttons ?? []) {
      const el = document.createElement('button');
      el.className = `menu-button${button.primary ? ' is-primary' : ''}`;
      el.textContent = button.label;
      el.addEventListener('click', () => button.onClick());
      buttonRow.appendChild(el);
    }
    if (!screen.buttons?.length) buttonRow.remove();

    // Focus the primary action so Enter and Space work without a mouse.
    this.root.querySelector<HTMLButtonElement>('.menu-button.is-primary')?.focus();

    if (screen.autoHideMs) {
      this.hideTimer = window.setTimeout(() => this.hide(), screen.autoHideMs);
    }
  }

  hide(): void {
    window.clearTimeout(this.hideTimer);
    this.root.classList.add('is-hidden');
  }
}

function renderStats(stats: Array<[string, string]> | undefined): string {
  if (!stats?.length) return '';
  const rows = stats
    .map(
      ([label, value]) =>
        `<div class="menu-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join('');
  return `<div class="menu-stats">${rows}</div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
