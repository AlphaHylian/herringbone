import { Application } from 'pixi.js';
import { initNativeShell } from './platform/native';

async function boot(): Promise<void> {
  const host = document.getElementById('app')!;
  const app = new Application();
  await app.init({
    resizeTo: host,
    background: '#e8d9bf',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  host.appendChild(app.canvas);
  void initNativeShell();
}

void boot();
