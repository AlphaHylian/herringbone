/** DOM overlay: crosshair, hint line, what you're carrying, counters, start and settings panels. */

export interface Settings {
  volume: number;
  muted: boolean;
  sensitivity: number;
  quality: 'auto' | 'low' | 'high';
}

const CSS = `
:root { --ink: #f6efe3; --shade: rgba(24, 20, 16, 0.55); --accent: #ff7a2f; }
.hud, .hud * { box-sizing: border-box; font-family: ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', sans-serif; }
.hud { position: fixed; inset: 0; pointer-events: none; color: var(--ink); user-select: none; -webkit-user-select: none; }
.hud .cross { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: rgba(255,255,255,0.85); box-shadow: 0 0 0 1.5px rgba(0,0,0,0.35); transition: transform .12s, background .12s; }
.hud .cross.hot { transform: scale(1.7); background: #fff; }
.hud .cross.hidden { display: none; }
.hud .stats { position: absolute; left: max(14px, env(safe-area-inset-left)); top: max(12px, env(safe-area-inset-top)); background: var(--shade); padding: 7px 12px; border-radius: 12px; font-size: 13px; letter-spacing: .01em; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.hud .stats b { font-weight: 650; }
.hud .buttons { position: absolute; right: max(12px, env(safe-area-inset-right)); top: max(10px, env(safe-area-inset-top)); display: flex; gap: 8px; pointer-events: auto; }
.hud .btn { touch-action: manipulation; pointer-events: auto; border: 0; background: var(--shade); color: var(--ink); height: 40px; min-width: 40px; padding: 0 12px; border-radius: 12px; font-size: 14px; font-weight: 600; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); cursor: pointer; }
.hud .btn:active { transform: scale(.96); }
.hud .hint { position: absolute; left: 50%; bottom: calc(86px + env(safe-area-inset-bottom)); transform: translateX(-50%); max-width: min(92vw, 560px); text-align: center; font-size: 15px; line-height: 1.35; padding: 8px 14px; border-radius: 14px; background: var(--shade); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); transition: opacity .25s; }
.hud .hint:empty { display: none; }
.hud .carry { position: absolute; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; gap: 8px; }
.hud .chip { background: var(--shade); padding: 7px 11px; border-radius: 11px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.hud .chip i { display: inline-block; width: 16px; height: 9px; border-radius: 2px; background: #55585d; box-shadow: inset 0 -2px 0 rgba(0,0,0,.35); }
.hud .chip.marked i { background: #55585d linear-gradient(115deg, transparent 45%, #fff 46%, #fff 54%, transparent 55%); }
.hud .chip.cut i { width: 11px; clip-path: polygon(0 0, 100% 0, 60% 100%, 0 100%); background: #8b8e93; }
.hud .chip.dim { opacity: .55; }
.panel-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(20, 16, 12, 0.45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); z-index: 10; padding: 16px; }
.panel-wrap.hidden { display: none; }
.panel { width: min(440px, 100%); max-height: 100%; overflow: auto; background: #f4ece0; color: #2c241c; border-radius: 22px; padding: 26px 24px 22px; box-shadow: 0 20px 60px rgba(0,0,0,.35); font-family: ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', sans-serif; }
.panel h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -.01em; }
.panel h2 { margin: 0 0 14px; font-size: 20px; }
.panel p { margin: 0 0 14px; line-height: 1.45; color: #5a4d40; font-size: 15px; }
.panel ul { margin: 0 0 18px; padding-left: 18px; color: #5a4d40; font-size: 14px; line-height: 1.55; }
.panel .go { touch-action: manipulation; width: 100%; height: 50px; border: 0; border-radius: 14px; background: #2f2a25; color: #fff4e6; font-size: 17px; font-weight: 650; cursor: pointer; margin-top: 4px; }
.panel .go.secondary { background: transparent; color: #8a3b12; border: 1.5px solid #d7c6b0; }
.panel .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 14px; font-size: 15px; }
.panel .row input[type=range] { width: 55%; accent-color: #e0662a; }
.panel .seg { display: flex; background: #e6dccd; border-radius: 10px; padding: 3px; }
.panel .seg button { border: 0; background: transparent; padding: 6px 10px; border-radius: 8px; font-size: 13px; color: #5a4d40; cursor: pointer; }
.panel .seg button.on { background: #fffaf2; color: #2c241c; font-weight: 650; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
.stick { position: fixed; width: 110px; height: 110px; margin: -55px 0 0 -55px; border-radius: 50%; background: rgba(255,255,255,0.12); border: 1.5px solid rgba(255,255,255,0.35); display: none; pointer-events: none; z-index: 5; }
.stick .knob { position: absolute; left: 50%; top: 50%; width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.55); transform: translate(-50%, -50%); }
`;

export class Hud {
  readonly root: HTMLElement;
  private readonly cross: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly carry: HTMLElement;
  private readonly startWrap: HTMLElement;
  private readonly menuWrap: HTMLElement;
  readonly standBtn: HTMLButtonElement;
  readonly menuBtn: HTMLButtonElement;
  private lastHint = '';
  private lastCarry = '';
  private lastStats = '';
  onStart: () => void = () => {};
  onResume: () => void = () => {};
  onSettings: (s: Settings) => void = () => {};
  onNewSite: () => void = () => {};

  constructor(
    touch: boolean,
    private settings: Settings,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', 'hud');
    this.cross = el('div', 'cross');
    this.stats = el('div', 'stats');
    this.hintEl = el('div', 'hint');
    this.carry = el('div', 'carry');
    const buttons = el('div', 'buttons');
    this.standBtn = button('Stand', 'btn');
    this.menuBtn = button('☰', 'btn');
    this.menuBtn.setAttribute('aria-label', 'Menu');
    buttons.append(this.standBtn);
    // Fullscreen hides Safari's toolbars on iPad (iPhone Safari doesn't support it).
    const doc = document as Document & {
      webkitFullscreenEnabled?: boolean;
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    if (doc.fullscreenEnabled || doc.webkitFullscreenEnabled) {
      const fs = button('⛶', 'btn');
      fs.setAttribute('aria-label', 'Full screen');
      fs.addEventListener('click', (e) => {
        e.stopPropagation();
        const root = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => void;
        };
        const inFs = doc.fullscreenElement ?? doc.webkitFullscreenElement;
        try {
          if (inFs) {
            if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {});
            else doc.webkitExitFullscreen?.();
          } else if (root.requestFullscreen) {
            void root.requestFullscreen().catch(() => {});
          } else {
            root.webkitRequestFullscreen?.();
          }
        } catch {
          // Not allowed here; the game works the same without it.
        }
      });
      buttons.append(fs);
    }
    buttons.append(this.menuBtn);
    this.root.append(this.cross, this.stats, this.hintEl, this.carry, buttons);
    document.body.appendChild(this.root);

    const verb = touch ? 'Tap' : 'Click';
    this.startWrap = el('div', 'panel-wrap');
    const start = el('div', 'panel');
    start.innerHTML = `
      <h1>Herringbone</h1>
      <p>An endless garden path, ready for paving. Lay charcoal blocks in herringbone, cut the
      edges on the splitter and keep going as far as you like. No timer, no score to chase.</p>
      <ul>
        ${
          touch
            ? `<li>Left thumb: walk. Right thumb: drag to look.</li>
               <li>Tap a pack to pick up blocks, tap the sand bed to lay one.</li>
               <li>Press and hold, then drag, to lay as you sweep.</li>`
            : `<li>WASD to walk, mouse to look, C to kneel or stand.</li>
               <li>Click a pack to pick up blocks, click the sand bed to lay one.</li>
               <li>Hold the button and sweep across the bed to keep laying.</li>`
        }
        <li>Gaps at the kerb need a cut: ${verb.toLowerCase()} the gap to mark a block, take it to the
        splitter, then lay the cut piece.</li>
      </ul>`;
    const go = button('Start paving', 'go');
    go.addEventListener('click', () => this.onStart());
    start.appendChild(go);
    this.startWrap.appendChild(start);
    document.body.appendChild(this.startWrap);

    this.menuWrap = el('div', 'panel-wrap hidden');
    this.menuWrap.appendChild(this.buildMenu());
    document.body.appendChild(this.menuWrap);
    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showMenu(true);
    });
    this.setCrosshair(!touch);
  }

  private buildMenu(): HTMLElement {
    const panel = el('div', 'panel');
    const h = el('h2');
    h.textContent = 'Paused';
    panel.appendChild(h);

    const volRow = el('div', 'row');
    volRow.innerHTML = '<span>Sound</span>';
    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '1';
    vol.step = '0.05';
    vol.value = String(this.settings.muted ? 0 : this.settings.volume);
    vol.addEventListener('input', () => {
      const v = Number(vol.value);
      this.settings = { ...this.settings, volume: v, muted: v === 0 };
      this.onSettings(this.settings);
    });
    volRow.appendChild(vol);

    const sensRow = el('div', 'row');
    sensRow.innerHTML = '<span>Look speed</span>';
    const sens = document.createElement('input');
    sens.type = 'range';
    sens.min = '0.3';
    sens.max = '2.5';
    sens.step = '0.05';
    sens.value = String(this.settings.sensitivity);
    sens.addEventListener('input', () => {
      this.settings = { ...this.settings, sensitivity: Number(sens.value) };
      this.onSettings(this.settings);
    });
    sensRow.appendChild(sens);

    const qRow = el('div', 'row');
    qRow.innerHTML = '<span>Graphics</span>';
    const seg = el('div', 'seg');
    for (const q of ['auto', 'low', 'high'] as const) {
      const b = button(q[0]!.toUpperCase() + q.slice(1), q === this.settings.quality ? 'on' : '');
      b.addEventListener('click', () => {
        for (const c of Array.from(seg.children)) c.classList.remove('on');
        b.classList.add('on');
        this.settings = { ...this.settings, quality: q };
        this.onSettings(this.settings);
      });
      seg.appendChild(b);
    }
    qRow.appendChild(seg);
    const note = el('p');
    note.textContent = 'Graphics changes apply the next time the page loads.';
    note.style.fontSize = '13px';

    const resume = button('Resume', 'go');
    resume.addEventListener('click', () => {
      this.showMenu(false);
      this.onResume();
    });
    const fresh = button('Start a new path', 'go secondary');
    fresh.style.marginTop = '10px';
    let armed = false;
    fresh.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        fresh.textContent = 'Tap again to clear this path';
        setTimeout(() => {
          armed = false;
          fresh.textContent = 'Start a new path';
        }, 3000);
        return;
      }
      this.onNewSite();
    });
    panel.append(volRow, sensRow, qRow, note, resume, fresh);
    return panel;
  }

  get menuOpen(): boolean {
    return !this.menuWrap.classList.contains('hidden');
  }

  get started(): boolean {
    return this.startWrap.classList.contains('hidden');
  }

  hideStart(): void {
    this.startWrap.classList.add('hidden');
  }

  showMenu(on: boolean): void {
    this.menuWrap.classList.toggle('hidden', !on);
  }

  setCrosshair(on: boolean, hot = false): void {
    this.cross.classList.toggle('hidden', !on);
    this.cross.classList.toggle('hot', hot);
  }

  hint(text: string): void {
    if (text === this.lastHint) return;
    this.lastHint = text;
    this.hintEl.textContent = text;
  }

  setStats(laid: number, area: number): void {
    const s = `<b>${laid.toLocaleString()}</b> laid · <b>${area.toFixed(1)}</b> m²`;
    if (s === this.lastStats) return;
    this.lastStats = s;
    this.stats.innerHTML = s;
  }

  setCarry(whole: number, marked: number, cut: number): void {
    const s = `${whole}|${marked}|${cut}`;
    if (s === this.lastCarry) return;
    this.lastCarry = s;
    const chips: string[] = [];
    chips.push(`<div class="chip${whole === 0 ? ' dim' : ''}"><i></i>${whole}</div>`);
    if (marked > 0) chips.push(`<div class="chip marked"><i></i>${marked} marked</div>`);
    if (cut > 0) chips.push(`<div class="chip cut"><i></i>${cut} cut</div>`);
    this.carry.innerHTML = chips.join('');
  }
}

function el(tag: string, cls = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function button(text: string, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  if (cls) b.className = cls;
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  return b;
}
