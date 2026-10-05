/**
 * Paving block geometry and materials: whole blocks (instanced), cut pieces (extruded from the
 * exact cut polygon, with the freshly split faces paler), and the per-instance texture jitter
 * that keeps a thousand identical blocks from looking stamped.
 */
import * as THREE from 'three';
import { insetConvex, type Pt, type Ring } from '../core/geom';
import { mulberry32 } from './path';
import { BRICK_L, BRICK_T, BRICK_W, cutEdges, type Slot } from './slots';
import type { SurfaceTex } from './textures';

export const JOINT = 0.0012;
/** Finished paving level. Everything else is measured from here. */
export const PAVE_Y = 0;
export const SAND_Y = -0.079;

const TOP = 1.12;
const SIDE = 0.5;
const SPLIT = 1.15;
const BOTTOM = 0.35;

/** Shade vertices: dusty sunlit tops, darker sides fading towards the bottom. */
function shadeByNormal(geo: THREE.BufferGeometry, height: number): void {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i);
    const t = (pos.getY(i) + height / 2) / height;
    let c: number;
    if (ny > 0.6) c = TOP;
    else if (ny < -0.6) c = BOTTOM;
    else c = SIDE * (0.55 + 0.45 * t);
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * A whole block with chamfered edges (60 triangles), centred on the origin. Laid blocks are
 * translated down by half their thickness.
 */
export function wholeBrickGeometry(): THREE.BufferGeometry {
  const hx = BRICK_L / 2 - JOINT;
  const hz = BRICK_W / 2 - JOINT;
  const k = 0.004;
  const shape = new THREE.Shape(
    (
      [
        [-hx + k, -hz],
        [hx - k, -hz],
        [hx, -hz + k],
        [hx, hz - k],
        [hx - k, hz],
        [-hx + k, hz],
        [-hx, hz - k],
        [-hx, -hz + k],
      ] as const
    ).map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const b = 0.004;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: BRICK_T - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(BRICK_T / 2 - b), 0);
  geo.clearGroups();
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 5);
  shadeByNormal(geo, BRICK_T);
  return geo;
}

/** A plain box block (12 triangles) for packs and distant paving. */
export function boxBrickGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(BRICK_L - 2 * JOINT, BRICK_T, BRICK_W - 2 * JOINT);
  shadeByNormal(geo, BRICK_T);
  return geo;
}

/**
 * Concrete block material. Instanced copies sample the texture at an offset derived from their
 * position so no two blocks share the same speckle pattern.
 */
export function brickMaterial(tex: SurfaceTex): THREE.MeshStandardMaterial {
  const map = tex.map.clone();
  map.repeat.set(2.2, 2.2);
  map.needsUpdate = true;
  const normalMap = tex.normalMap.clone();
  normalMap.repeat.set(2.2, 2.2);
  normalMap.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec2 jitter = fract(instanceMatrix[3].xz * vec2(3.17, 2.71));
        #ifdef USE_MAP
          vMapUv += jitter;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv += jitter;
        #endif
      #endif`,
    );
  };
  return mat;
}

/** Charcoal blocks with a little batch-to-batch variation, like a real delivery. */
export function brickTint(seed: number): THREE.Color {
  const r = mulberry32(seed * 7919 + 13);
  const v = 0.4 + (r() - 0.5) * 0.08;
  const warm = (r() - 0.5) * 0.012;
  return new THREE.Color().setRGB(v + warm, v + warm * 0.5, v + 0.008, THREE.SRGBColorSpace);
}

/** Matrix for a whole block lying in a slot (top flush with the paving level). */
export function slotMatrix(slot: Slot, out: THREE.Matrix4, lift = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -slot.angle);
  return out.compose(
    new THREE.Vector3(slot.x, PAVE_Y - BRICK_T / 2 + lift, slot.z),
    q,
    new THREE.Vector3(1, 1, 1),
  );
}

export function ringCentroid2(r: Ring): Pt {
  let x = 0;
  let z = 0;
  for (const p of r) {
    x += p[0];
    z += p[1];
  }
  return [x / r.length, z / r.length];
}

/**
 * A cut piece as an extruded polygon, centred on its centroid (returned so the caller can place
 * it). Faces made by the splitter are shaded paler than the original block faces.
 */
export function cutPieceGeometry(
  slot: Slot,
  tint: THREE.Color,
): { geo: THREE.BufferGeometry; center: Pt } {
  const center = ringCentroid2(slot.piece);
  const ring = insetConvex(slot.piece, JOINT);
  const shape = new THREE.Shape(
    ring.map((p) => new THREE.Vector2(p[0] - center[0], -(p[1] - center[1]))),
  );
  const bevel = 0.003;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: BRICK_T - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  // Extrusion now runs from y = -bevel to y = T - bevel; centre it vertically.
  geo.translate(0, -(BRICK_T / 2 - bevel), 0);
  geo.clearGroups();
  // UVs from ExtrudeGeometry are in metres; scale to match whole blocks.
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5 + 0.3, uv.getY(i) * 5 + 0.7);

  const cuts = cutEdges(slot).map(
    ([a, b]) =>
      [
        [a[0] - center[0], a[1] - center[1]],
        [b[0] - center[0], b[1] - center[1]],
      ] as [Pt, Pt],
  );
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const onCut = (x: number, z: number): boolean =>
    cuts.some(([a, b]) => {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz);
      return Math.abs((x - a[0]) * dz - (z - a[1]) * dx) / l < 0.006;
    });
  const n = pos.count;
  for (let t = 0; t + 2 < n; t += 3) {
    let ny = 0;
    let mx = 0;
    let mz = 0;
    for (let v = t; v < t + 3; v++) {
      ny += nor.getY(v) / 3;
      mx += pos.getX(v) / 3;
      mz += pos.getZ(v) / 3;
    }
    const split = Math.abs(ny) < 0.6 && onCut(mx, mz);
    for (let v = t; v < t + 3; v++) {
      const h = (pos.getY(v) + BRICK_T / 2) / BRICK_T;
      let c: number;
      if (nor.getY(v) > 0.6) c = TOP;
      else if (nor.getY(v) < -0.6) c = BOTTOM;
      else if (split) c = SPLIT * (0.75 + 0.25 * h);
      else c = SIDE * (0.55 + 0.45 * h);
      colors[v * 3] = c * tint.r;
      colors[v * 3 + 1] = c * tint.g;
      colors[v * 3 + 2] = c * tint.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return { geo, center };
}

/** Bake a tint into a whole-block geometry clone (for single meshes like held blocks). */
export function tintedBrick(base: THREE.BufferGeometry, tint: THREE.Color): THREE.BufferGeometry {
  const geo = base.clone();
  const c = geo.getAttribute('color');
  for (let i = 0; i < c.count; i++)
    c.setXYZ(i, c.getX(i) * tint.r, c.getY(i) * tint.g, c.getZ(i) * tint.b);
  return geo;
}

/**
 * Bricks in a delivered pack: 8 layers of 5 x 10 blocks (1.0 m square), each layer turned 90
 * degrees to the one below. Ordered top layer first so blocks are taken from the top.
 */
export const PACK_LAYERS = 8;
export const PACK_PER_LAYER = 50;
export const PACK_SIZE = PACK_LAYERS * PACK_PER_LAYER;
export const PALLET_H = 0.12;

export function packLayout(): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const one = new THREE.Vector3(1, 1, 1);
  for (let layer = PACK_LAYERS - 1; layer >= 0; layer--) {
    const y = PALLET_H + BRICK_T / 2 + layer * (BRICK_T + 0.001);
    const turned = layer % 2 === 1;
    const cells: THREE.Matrix4[] = [];
    for (let a = 0; a < 5; a++) {
      for (let b = 0; b < 10; b++) {
        const along = -0.4 + a * BRICK_L;
        const across = -0.45 + b * BRICK_W;
        const pos = turned
          ? new THREE.Vector3(across, y, along)
          : new THREE.Vector3(along, y, across);
        cells.push(new THREE.Matrix4().compose(pos, turned ? q1 : q0, one));
      }
    }
    // Take from the near rows first within a layer, as you'd reach for them.
    out.push(...cells);
  }
  return out;
}
