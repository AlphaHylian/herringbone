import { Game } from './game';

const app = document.getElementById('app')!;

// Safari's pinch and double-tap zoom would fight the look and lay gestures.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend'])
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
const loading = document.getElementById('loading');

// Let the loading screen paint before the (synchronous) texture and world generation.
requestAnimationFrame(() =>
  setTimeout(() => {
    const game = new Game(app);
    (window as unknown as { __pv: unknown }).__pv = game;
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), 450);
    }
    let last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.update(dt);
      game.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, 30),
);
