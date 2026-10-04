/**
 * Top-down decorations, drawn procedurally in world millimetres. Each factory returns a
 * container centred on the decoration; some (the cat) animate via `tick`.
 */
import { Container, Graphics } from 'pixi.js';
import type { Decoration, DecorationType } from '../core/level';
import { rng } from '../core/rng';

export interface DecorNode {
  node: Container;
  tick?: (t: number, dt: number) => void;
}

const SHADOW = { color: 0x1e140c, alpha: 0.22 };

function shadow(g: Graphics, draw: (g: Graphics) => void, dx = 18, dy = 26): void {
  g.position.set(dx, dy);
  draw(g);
}

function bench(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  shadow(sh, (g) => g.roundRect(-620, -200, 1240, 400, 40).fill(SHADOW));
  const g = new Graphics();
  // legs/frame
  g.roundRect(-560, -190, 70, 380, 16).fill(0x3d3632);
  g.roundRect(490, -190, 70, 380, 16).fill(0x3d3632);
  // slats
  const woods = [0xa77b52, 0xb38759, 0x9c714a, 0xae8257];
  for (let i = 0; i < 4; i++) {
    g.roundRect(-600, -170 + i * 90, 1200, 72, 14).fill(woods[i]!);
    g.roundRect(-600, -170 + i * 90, 1200, 14, 7).fill({ color: 0xffffff, alpha: 0.12 });
  }
  node.addChild(sh, g);
  return { node };
}

function leafyBlob(g: Graphics, r: number, seed: number, colors: number[], n = 9): void {
  const rand = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.5;
    const d = r * (0.35 + rand() * 0.35);
    g.circle(Math.cos(a) * d, Math.sin(a) * d, r * (0.38 + rand() * 0.2)).fill(
      colors[i % colors.length]!,
    );
  }
  g.circle(0, 0, r * 0.45).fill(colors[0]!);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = r * rand() * 0.7;
    g.circle(Math.cos(a) * d - r * 0.08, Math.sin(a) * d - r * 0.08, r * 0.12).fill({
      color: 0xffffff,
      alpha: 0.12,
    });
  }
}

function plant(seed = 3): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  shadow(sh, (g) => g.circle(0, 0, 190).fill(SHADOW));
  const g = new Graphics();
  g.circle(0, 0, 170).fill(0xb4613f);
  g.circle(0, 0, 145).fill(0xc8734c);
  g.circle(0, 0, 128).fill(0x4a3526);
  leafyBlob(g, 190, seed, [0x5f8a3e, 0x6f9c47, 0x547d36, 0x7aa751]);
  // a few flowers
  const rand = rng(seed + 9);
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const d = 60 + rand() * 90;
    g.circle(Math.cos(a) * d, Math.sin(a) * d, 22).fill(i % 2 ? 0xf2c14e : 0xf4efe6);
  }
  node.addChild(sh, g);
  return { node };
}

function cat(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  shadow(sh, (g) => g.ellipse(0, 0, 230, 110).fill({ ...SHADOW, alpha: 0.16 }), 12, 20);
  const body = new Container();
  const tail = new Graphics();
  const legs = new Graphics();
  const g = new Graphics();
  const fur = 0xd98b45;
  const dark = 0xb36a30;
  // body (facing +x)
  g.ellipse(0, 0, 200, 95).fill(fur);
  g.ellipse(-40, 0, 120, 60).fill({ color: dark, alpha: 0.35 });
  for (let i = 0; i < 4; i++) g.rect(-120 + i * 55, -80, 18, 160).fill({ color: dark, alpha: 0.4 });
  // head
  g.circle(215, 0, 78).fill(fur);
  g.poly([200, -55, 245, -95, 262, -40]).fill(fur);
  g.poly([200, 55, 245, 95, 262, 40]).fill(fur);
  g.poly([215, -52, 243, -80, 252, -45]).fill(0xe8a7a0);
  g.poly([215, 52, 243, 80, 252, 45]).fill(0xe8a7a0);
  g.rect(180, -8, 60, 16).fill({ color: dark, alpha: 0.4 });
  tail
    .moveTo(0, 0)
    .bezierCurveTo(-90, 10, -140, 70, -200, 40)
    .stroke({ width: 34, color: fur, cap: 'round' });
  tail.position.set(-180, 0);
  body.addChild(legs, tail, g);
  node.addChild(sh, body);
  let phase = 0;
  const drawLegs = (step: number): void => {
    legs.clear();
    const s = Math.sin(step) * 40;
    for (const [x, y, k] of [
      [120, -70, 1],
      [120, 70, -1],
      [-110, -70, -1],
      [-110, 70, 1],
    ] as [number, number, number][]) {
      legs.ellipse(x + s * k, y * 1.05, 40, 26).fill(0xc77c3c);
    }
  };
  drawLegs(0);
  (node as Container & { isCat?: boolean }).isCat = true;
  return {
    node,
    tick: (t, dt) => {
      const moving = (node as Container & { walking?: boolean }).walking ?? false;
      if (moving) phase += dt * 9;
      drawLegs(phase);
      body.y = moving ? Math.sin(phase * 2) * 4 : 0;
      tail.rotation = Math.sin(t * (moving ? 3 : 1.2)) * (moving ? 0.25 : 0.4);
    },
  };
}

function lantern(): DecorNode {
  const node = new Container();
  const glow = new Graphics();
  for (let i = 5; i > 0; i--) glow.circle(0, 0, 90 + i * 45).fill({ color: 0xffd98a, alpha: 0.05 });
  const g = new Graphics();
  g.roundRect(-75, -75, 150, 150, 20).fill(0x2f2b28);
  g.roundRect(-50, -50, 100, 100, 14).fill(0xf6d27a);
  g.circle(0, 0, 22).fill(0xfff4cf);
  const sh = new Graphics();
  shadow(sh, (x) => x.roundRect(-75, -75, 150, 150, 20).fill(SHADOW), 14, 20);
  node.addChild(glow, sh, g);
  return { node, tick: (t) => (glow.alpha = 0.85 + Math.sin(t * 2.3) * 0.15) };
}

function bike(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  shadow(sh, (g) => g.roundRect(-560, -60, 1120, 120, 50).fill(SHADOW));
  const g = new Graphics();
  // wheels seen from above are thin dark bars
  g.roundRect(-560, -22, 360, 44, 20).fill(0x2b2b2b);
  g.roundRect(200, -22, 360, 44, 20).fill(0x2b2b2b);
  g.moveTo(-380, 0).lineTo(380, 0).stroke({ width: 26, color: 0x2f7d8c, cap: 'round' });
  g.moveTo(330, -170).lineTo(330, 170).stroke({ width: 22, color: 0x444444, cap: 'round' });
  g.roundRect(-150, -45, 150, 90, 40).fill(0x3a2a20);
  g.rect(-470, -70, 200, 140).fill({ color: 0x8a6a48, alpha: 0.9 }); // rack basket
  node.addChild(sh, g);
  return { node };
}

function table(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  const g = new Graphics();
  const chairs = new Graphics();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const x = Math.cos(a) * 420;
    const y = Math.sin(a) * 420;
    sh.circle(x + 16, y + 22, 175).fill(SHADOW);
    chairs.circle(x, y, 165).fill(0x55707a);
    chairs.circle(x, y, 135).fill(0x6a8892);
    chairs
      .circle(x + Math.cos(a) * 110, y + Math.sin(a) * 110, 120)
      .fill({ color: 0x4a636b, alpha: 0.8 });
  }
  sh.circle(18, 26, 330).fill(SHADOW);
  g.circle(0, 0, 320).fill(0xe8e2d6);
  g.circle(0, 0, 300).fill(0xf3eee4);
  g.circle(-60, -40, 50).fill(0xffffff); // cup
  g.circle(-60, -40, 34).fill(0x7a4a2a);
  g.circle(80, 60, 70).fill(0xd8d2c8);
  node.addChild(sh, chairs, g);
  return { node };
}

function parasol(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  const g = new Graphics();
  const r = 640;
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  sh.poly(pts).fill({ ...SHADOW, alpha: 0.18 });
  sh.position.set(60, 90);
  for (let i = 0; i < 8; i++) {
    const a0 = (i * Math.PI) / 4 + Math.PI / 8;
    const a1 = a0 + Math.PI / 4;
    g.poly([0, 0, Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r]).fill(
      i % 2 ? 0xf2ede2 : 0xc9573d,
    );
  }
  g.circle(0, 0, 36).fill(0x8a6a48);
  node.addChild(sh, g);
  return { node };
}

function firepit(): DecorNode {
  const node = new Container();
  const g = new Graphics();
  const glow = new Graphics();
  const rand = rng(11);
  const stones = 16;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2;
    g.ellipse(Math.cos(a) * 200, Math.sin(a) * 200, 62, 52).fill(
      [0x8a8178, 0x7b736b, 0x958c82][i % 3]!,
    );
  }
  g.circle(0, 0, 160).fill(0x2c2420);
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI;
    g.moveTo(Math.cos(a) * -110, Math.sin(a) * -110)
      .lineTo(Math.cos(a) * 110, Math.sin(a) * 110)
      .stroke({ width: 34, color: 0x4a3324, cap: 'round' });
  }
  for (let i = 4; i > 0; i--)
    glow.circle(0, 0, 40 + i * 30).fill({ color: i > 2 ? 0xe2662a : 0xffc04a, alpha: 0.28 });
  node.addChild(g, glow);
  return {
    node,
    tick: (t) => glow.scale.set(0.9 + Math.sin(t * 7) * 0.06 + Math.sin(t * 13.3) * 0.04),
  };
}

function tree(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  sh.circle(0, 0, 560).fill({ ...SHADOW, alpha: 0.2 });
  sh.position.set(110, 150);
  const g = new Graphics();
  g.circle(0, 0, 90).fill(0x5d4330);
  leafyBlob(g, 560, 21, [0x4f7a38, 0x5d8a42, 0x466e31, 0x6a9a4b], 12);
  const canopy = new Container();
  canopy.addChild(g);
  canopy.alpha = 0.96;
  node.addChild(sh, canopy);
  return { node, tick: (t) => (canopy.rotation = Math.sin(t * 0.6) * 0.012) };
}

function car(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  shadow(sh, (g) => g.roundRect(-440, -900, 880, 1800, 200).fill(SHADOW), 30, 40);
  const g = new Graphics();
  g.roundRect(-430, -880, 860, 1760, 200).fill(0x4f7fa0);
  g.roundRect(-360, -420, 720, 420, 90).fill(0x2a3640); // windscreen + roof
  g.roundRect(-330, -360, 660, 900, 90).fill(0x5d8fb1);
  g.roundRect(-340, 380, 680, 260, 70).fill(0x2a3640);
  g.roundRect(-430, -880, 860, 120, 60).fill({ color: 0xffffff, alpha: 0.15 });
  node.addChild(sh, g);
  return { node };
}

function wateringCan(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  shadow(sh, (g) => g.ellipse(0, 0, 180, 120).fill(SHADOW), 12, 18);
  const g = new Graphics();
  g.ellipse(0, 0, 170, 115).fill(0x6f9aa2);
  g.ellipse(-10, -10, 120, 70).fill(0x82adb5);
  g.moveTo(140, 0).lineTo(330, -90).stroke({ width: 30, color: 0x6f9aa2, cap: 'round' });
  g.circle(340, -95, 34).fill(0x5e8a92);
  g.moveTo(-120, -60).quadraticCurveTo(-200, 0, -120, 60).stroke({ width: 22, color: 0x5e8a92 });
  node.addChild(sh, g);
  return { node };
}

function birdbath(): DecorNode {
  const node = new Container();
  const sh = new Graphics();
  shadow(sh, (g) => g.circle(0, 0, 260).fill(SHADOW));
  const g = new Graphics();
  g.circle(0, 0, 250).fill(0xbfb6a8);
  g.circle(0, 0, 205).fill(0xa9a093);
  const water = new Graphics();
  water.circle(0, 0, 190).fill(0x8fb8c4);
  water.circle(-50, -50, 60).fill({ color: 0xffffff, alpha: 0.35 });
  // a little bird
  const bird = new Graphics();
  bird.ellipse(0, 0, 60, 36).fill(0x7a5a44);
  bird.circle(52, 0, 28).fill(0x8a6a50);
  bird.poly([78, -6, 100, 0, 78, 6]).fill(0xe2a54b);
  bird.position.set(150, -120);
  bird.rotation = 2.4;
  node.addChild(sh, g, water, bird);
  return {
    node,
    tick: (t) => (
      water.scale.set(1 + Math.sin(t * 2) * 0.01),
      (bird.rotation = 2.4 + Math.sin(t * 1.3) * 0.2)
    ),
  };
}

export function makeDecoration(d: Decoration): DecorNode {
  const make: Record<DecorationType, () => DecorNode> = {
    bench,
    plant: () => plant(Math.round(d.at[0] + d.at[1])),
    cat,
    lantern,
    bike,
    table,
    firepit,
    tree,
    car,
    'watering-can': wateringCan,
    birdbath,
    parasol,
  };
  const n = make[d.type]();
  n.node.position.set(d.at[0], d.at[1]);
  n.node.rotation = ((d.rotation ?? 0) * Math.PI) / 180;
  return n;
}

/** Draw order: things on the ground first, canopies last. */
export const DECOR_LAYER: Record<DecorationType, number> = {
  firepit: 0,
  'watering-can': 1,
  birdbath: 1,
  plant: 1,
  lantern: 1,
  bench: 2,
  bike: 2,
  table: 2,
  car: 2,
  cat: 3,
  parasol: 4,
  tree: 5,
};
