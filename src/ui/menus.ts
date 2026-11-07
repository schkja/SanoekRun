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

/** One line in a settings list: a label, and either a value or an on/off switch. */
export interface MenuRow {
  label: string;
  /** Shown on the right, e.g. the current language. Tapping the row changes it. */
  value?: string;
  /** Shown as a switch instead of a value. */
  toggle?: boolean;
  /** Marks the chosen option in a pick-one list. */
  selected?: boolean;
  /** A second, smaller line under the label. */
  hint?: string;
  onClick: () => void;
}

export interface MenuSection {
  title?: string;
  rows: MenuRow[];
}

/** A big tappable card, e.g. one per character on the title screen. */
export interface MenuChoice {
  label: string;
  caption?: string;
  /** Trusted SVG markup for a little portrait. */
  art?: string;
  selected: boolean;
  onClick: () => void;
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
  /** A short label above the choices, e.g. "Choose your hero". */
  choicesTitle?: string;
  choices?: MenuChoice[];
  sections?: MenuSection[];
  buttons?: MenuButton[];
  /** Small print under everything, e.g. keyboard controls. */
  note?: string;
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
        ${screen.choices?.length ? `${screen.choicesTitle ? `<p class="menu-label">${escapeHtml(screen.choicesTitle)}</p>` : ''}<div class="menu-choices"></div>` : ''}
        ${screen.sections?.length ? '<div class="menu-sections"></div>' : ''}
        <div class="menu-buttons"></div>
        ${screen.note ? `<p class="menu-note">${escapeHtml(screen.note)}</p>` : ''}
      </div>
    `;

    const choiceRow = this.root.querySelector<HTMLElement>('.menu-choices');
    for (const choice of screen.choices ?? []) {
      const el = document.createElement('button');
      el.className = `menu-choice${choice.selected ? ' is-selected' : ''}`;
      el.setAttribute('aria-pressed', String(choice.selected));
      el.innerHTML = `
        ${choice.art ? `<span class="menu-choice-art" aria-hidden="true">${choice.art}</span>` : ''}
        <span class="menu-choice-label">${escapeHtml(choice.label)}</span>
        ${choice.caption ? `<span class="menu-choice-caption">${escapeHtml(choice.caption)}</span>` : ''}
      `;
      el.addEventListener('click', () => choice.onClick());
      choiceRow?.appendChild(el);
    }

    const sectionList = this.root.querySelector<HTMLElement>('.menu-sections');
    for (const section of screen.sections ?? []) {
      if (section.title) {
        const heading = document.createElement('p');
        heading.className = 'menu-section-title';
        heading.textContent = section.title;
        sectionList?.appendChild(heading);
      }
      const list = document.createElement('div');
      list.className = 'menu-rows';
      for (const row of section.rows) {
        const el = document.createElement('button');
        el.className = `menu-row${row.selected ? ' is-selected' : ''}`;
        if (row.toggle !== undefined) {
          el.setAttribute('role', 'switch');
          el.setAttribute('aria-checked', String(row.toggle));
        }
        el.innerHTML = `
          <span class="menu-row-text">
            <span class="menu-row-label">${escapeHtml(row.label)}</span>
            ${row.hint ? `<span class="menu-row-hint">${escapeHtml(row.hint)}</span>` : ''}
          </span>
          ${row.value !== undefined ? `<span class="menu-row-value">${escapeHtml(row.value)}<span class="menu-row-chevron" aria-hidden="true">›</span></span>` : ''}
          ${row.toggle !== undefined ? `<span class="menu-switch${row.toggle ? ' is-on' : ''}" aria-hidden="true"><span></span></span>` : ''}
          ${row.selected ? '<span class="menu-row-check" aria-hidden="true">✓</span>' : ''}
        `;
        el.addEventListener('click', () => row.onClick());
        list.appendChild(el);
      }
      sectionList?.appendChild(list);
    }

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
    this.root.querySelector<HTMLButtonElement>('.menu-button.is-primary')?.focus({ preventScroll: true });

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
