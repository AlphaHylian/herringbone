/** Site props built from primitives: pallet, kerb units, block splitter, trees, straps, grass. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './path';
import { PALLET_H } from './bricks';

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** A 1.0 m square timber pallet: three bearers under seven deck boards. */
export function palletGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bearerH = PALLET_H - 0.022;
  for (const z of [-0.44, 0, 0.44]) parts.push(box(1.0, bearerH, 0.1, 0, bearerH / 2, z));
  for (let i = 0; i < 7; i++) {
    const x = -0.45 + i * 0.15;
    parts.push(box(0.1, 0.022, 1.0, x, PALLET_H - 0.011, 0));
  }
  return mergeGeometries(parts)!;
}

/** One precast edging unit, 1 m long (scaled per instance), top at y = 0.012. */
export function kerbGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 0.22, 0.07, 1, 1, 1);
  g.translate(0, 0.012 - 0.11, 0);
  // Scale UVs so the texture doesn't stretch along the unit.
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 0.6);
  return g;
}

export interface SplitterParts {
  root: THREE.Group;
  /** Rotates about x to pull the blade down; 0 is open. */
  lever: THREE.Group;
  blade: THREE.Object3D;
  /** Where a block sits to be cut, in the root's local space. */
  bed: THREE.Vector3;
}

/**
 * A wheeled block splitter (guillotine): steel frame, bed with a lower blade, an upper blade
 * on twin guides and a long lever. Local +z is the operator's side.
 */
export function buildSplitter(): SplitterParts {
  const steel = new THREE.MeshStandardMaterial({
    color: 0xb9bcbf,
    metalness: 0.75,
    roughness: 0.42,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, metalness: 0.5, roughness: 0.55 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.9 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2b2b2d, roughness: 0.75 });
  const root = new THREE.Group();

  const frame = mergeGeometries([
    // Side rails
    box(0.04, 0.04, 0.72, -0.17, 0.08, 0),
    box(0.04, 0.04, 0.72, 0.17, 0.08, 0),
    // Cross members
    box(0.38, 0.04, 0.04, 0, 0.08, -0.34),
    box(0.38, 0.04, 0.04, 0, 0.08, 0.34),
    // Legs up to the bed
    box(0.04, 0.32, 0.04, -0.17, 0.24, -0.06),
    box(0.04, 0.32, 0.04, 0.17, 0.24, -0.06),
    box(0.04, 0.32, 0.04, -0.17, 0.24, 0.14),
    box(0.04, 0.32, 0.04, 0.17, 0.24, 0.14),
    // Bed
    box(0.42, 0.03, 0.34, 0, 0.415, 0.04),
    // Guides
    box(0.035, 0.42, 0.035, -0.19, 0.64, 0.04),
    box(0.035, 0.42, 0.035, 0.19, 0.64, 0.04),
    box(0.42, 0.04, 0.05, 0, 0.86, 0.04),
    // Lever pivot post at the back
    box(0.05, 0.5, 0.05, 0, 0.67, -0.12),
    // Handle to push the wheels
    box(0.03, 0.03, 0.3, 0, 0.12, -0.5),
  ])!;
  const frameMesh = new THREE.Mesh(frame, steel);
  root.add(frameMesh);

  // Lower blade (fixed) on the bed.
  const lowBlade = new THREE.Mesh(box(0.4, 0.025, 0.02, 0, 0.443, 0.04), dark);
  root.add(lowBlade);

  // Upper blade on a carriage between the guides.
  const blade = new THREE.Group();
  blade.add(new THREE.Mesh(box(0.36, 0.08, 0.03, 0, 0, 0), steel));
  blade.add(new THREE.Mesh(box(0.36, 0.02, 0.02, 0, -0.05, 0), dark));
  blade.position.set(0, 0.66, 0.04);
  root.add(blade);

  // Lever: pivots at the back post, handle reaches towards the operator.
  const lever = new THREE.Group();
  lever.position.set(0, 0.9, -0.12);
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 1.0, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    steel,
  );
  lever.add(arm);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 0.16, 12).rotateZ(Math.PI / 2).translate(0, 0, 0.98),
    grip,
  );
  lever.add(handle);
  root.add(lever);

  // Wheels at the back.
  for (const x of [-0.22, 0.22]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.04, 20).rotateZ(Math.PI / 2),
      rubber,
    );
    wheel.position.set(x, 0.075, -0.3);
    root.add(wheel);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.045, 12).rotateZ(Math.PI / 2),
      steel,
    );
    hub.position.copy(wheel.position);
    root.add(hub);
  }

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, lever, blade, bed: new THREE.Vector3(0, 0.47, 0.04) };
}

/**
 * Tree canopy: clusters of leaf cards around a few centres. Card normals point away from the
 * canopy centre so the foliage lights as one soft volume rather than as flat cards.
 */
export function treeGeometry(seed: number): {
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
} {
  const rnd = mulberry32(seed);
  const height = 3.2;
  const trunkParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.1, 0.17, height, 10, 4);
  trunk.translate(0, height / 2, 0);
  // A gentle lean and kink.
  const pos = trunk.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.sin(y * 0.9) * 0.08);
    pos.setZ(i, pos.getZ(i) + Math.sin(y * 0.6 + 1) * 0.06);
  }
  trunk.computeVertexNormals();
  trunkParts.push(trunk);
  // A few branches.
  const centres: THREE.Vector3[] = [];
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + rnd() * 0.8;
    const len = 1.2 + rnd() * 0.8;
    const br = new THREE.CylinderGeometry(0.035, 0.07, len, 6);
    br.translate(0, len / 2, 0);
    br.rotateZ(0.9 + rnd() * 0.3);
    br.rotateY(a);
    const y0 = height * (0.65 + rnd() * 0.3);
    br.translate(0, y0, 0);
    trunkParts.push(br);
    const tip = new THREE.Vector3(
      Math.cos(a) * len * 0.8,
      y0 + len * 0.5,
      -Math.sin(a) * len * 0.8,
    );
    centres.push(tip);
  }
  centres.push(new THREE.Vector3(0, height + 1.0, 0));

  const canopyCenter = new THREE.Vector3(0, height + 0.6, 0);
  const cards: THREE.BufferGeometry[] = [];
  for (const c of centres) {
    for (let k = 0; k < 26; k++) {
      const size = 0.9 + rnd() * 0.6;
      const card = new THREE.PlaneGeometry(size, size);
      card.rotateX(rnd() * Math.PI);
      card.rotateY(rnd() * Math.PI);
      card.rotateZ(rnd() * Math.PI);
      const r = 0.9 * Math.cbrt(rnd());
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      const p = new THREE.Vector3(
        c.x + r * Math.sin(ph) * Math.cos(th),
        c.y + r * Math.cos(ph) * 0.7,
        c.z + r * Math.sin(ph) * Math.sin(th),
      );
      card.translate(p.x, p.y, p.z);
      const n = card.getAttribute('normal');
      const cp = card.getAttribute('position');
      for (let i = 0; i < n.count; i++) {
        const d = new THREE.Vector3(cp.getX(i), cp.getY(i), cp.getZ(i))
          .sub(canopyCenter)
          .normalize();
        n.setXYZ(i, d.x, d.y, d.z);
      }
      cards.push(card);
    }
  }
  const trunkGeo = mergeGeometries(trunkParts)!;
  return { trunk: trunkGeo, canopy: mergeGeometries(cards)! };
}

/** A cut packing strap lying where it fell: a thin flat ribbon along a lazy curve. */
export function strapGeometry(rnd: () => number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  let x = 0;
  let z = 0;
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < 8; i++) {
    pts.push(new THREE.Vector3(x, 0, z));
    a += (rnd() - 0.5) * 1.4;
    x += Math.cos(a) * 0.22;
    z += Math.sin(a) * 0.22;
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const samples = curve.getPoints(48);
  const w = 0.008;
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const q = samples[Math.min(samples.length - 1, i + 1)]!;
    const o = samples[Math.max(0, i - 1)]!;
    const dx = q.x - o.x;
    const dz = q.z - o.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const lift = 0.002 + Math.max(0, Math.sin(i * 0.4)) * 0.01;
    positions.push(p.x + nx * w, lift, p.z + nz * w, p.x - nx * w, lift, p.z - nz * w);
    normals.push(0, 1, 0, 0, 1, 0);
    if (i > 0) {
      const b = (i - 1) * 2;
      index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

/** Three crossed cards for a grass tuft, rooted at y = 0. */
export function tuftGeometry(): THREE.BufferGeometry {
  const cards: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.PlaneGeometry(0.32, 0.22);
    c.translate(0, 0.11, 0);
    c.rotateY((i / 3) * Math.PI);
    const n = c.getAttribute('normal');
    for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
    cards.push(c);
  }
  return mergeGeometries(cards)!;
}
