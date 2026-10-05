/**
 * The 3D site: sky, sun, ground, and the endless path streamed in chunks. Each chunk owns its
 * laid blocks (one instanced mesh), its placed cut pieces (one merged mesh), the sand bed,
 * kerbs, a pack of blocks and some scenery. Chunks behind and far ahead of the player are
 * dropped and rebuilt from the saved placement bits when the player comes back.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  brickMaterial,
  boxBrickGeometry,
  brickTint,
  cutPieceGeometry,
  packLayout,
  PACK_SIZE,
  PALLET_H,
  SAND_Y,
  slotMatrix,
  wholeBrickGeometry,
} from './bricks';
import { mulberry32, type PathModel } from './path';
import { kerbGeometry, palletGeometry, strapGeometry, treeGeometry, tuftGeometry } from './props';
import { BRICK_T, buildChunk, CHUNK, slotAt, type Chunk, type Slot } from './slots';
import {
  barkTexture,
  concreteTexture,
  dirtTexture,
  grassTuftTexture,
  kerbTexture,
  lawnTexture,
  leafTexture,
  sandTexture,
  woodTexture,
  type SurfaceTex,
} from './textures';

export const GROUND_Y = -0.1;
const BEHIND = 18;
const AHEAD = 44;

export interface Quality {
  shadowSize: number;
  tufts: number;
  texSize: number;
}

export interface Pack {
  k: number;
  group: THREE.Group;
  bricks: THREE.InstancedMesh;
  taken: number;
  box: THREE.Box3;
  x: number;
  z: number;
}

export interface ChunkView {
  chunk: Chunk;
  group: THREE.Group;
  placed: Uint8Array;
  full: THREE.InstancedMesh;
  fullIndex: Int32Array;
  cutMesh: THREE.Mesh | null;
  pack: Pack;
  trees: { x: number; z: number }[];
  disposables: THREE.BufferGeometry[];
}

/** Everything about the site that's saved between sessions. */
export interface SiteState {
  seed: number;
  placed: Map<number, Uint8Array>;
  packTaken: Map<number, number>;
  laid: number;
  area: number;
}

interface Assets {
  brickGeo: THREE.BufferGeometry;
  boxGeo: THREE.BufferGeometry;
  brickMat: THREE.MeshStandardMaterial;
  cutMat: THREE.MeshStandardMaterial;
  sandMat: THREE.MeshStandardMaterial;
  dirtMat: THREE.MeshStandardMaterial;
  lawnMat: THREE.MeshStandardMaterial;
  kerbGeo: THREE.BufferGeometry;
  kerbMat: THREE.MeshStandardMaterial;
  palletGeo: THREE.BufferGeometry;
  woodMat: THREE.MeshStandardMaterial;
  strapMat: THREE.MeshStandardMaterial;
  tuftGeo: THREE.BufferGeometry;
  tuftMat: THREE.MeshStandardMaterial;
  trees: { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry }[];
  barkMat: THREE.MeshStandardMaterial;
  leafMat: THREE.MeshStandardMaterial;
  concrete: SurfaceTex;
}

function worldUvMaterial(
  tex: SurfaceTex,
  scale: number,
  extra: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  const map = tex.map.clone();
  const normalMap = tex.normalMap.clone();
  map.needsUpdate = true;
  normalMap.needsUpdate = true;
  map.repeat.set(scale, scale);
  normalMap.repeat.set(scale, scale);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughness: 0.95,
    metalness: 0,
    ...extra,
  });
}

export class World {
  readonly sun: THREE.DirectionalLight;
  readonly views = new Map<number, ChunkView>();
  readonly assets: Assets;
  private readonly ground: THREE.Mesh;
  private readonly sunOffset = new THREE.Vector3();

  constructor(
    readonly scene: THREE.Scene,
    readonly renderer: THREE.WebGLRenderer,
    readonly path: PathModel,
    readonly state: SiteState,
    readonly quality: Quality,
  ) {
    const n = quality.texSize;
    const concrete = concreteTexture(11, n);
    const sand = sandTexture(12, n);
    const dirt = dirtTexture(13, n);
    const lawn = lawnTexture(14, n);
    const kerb = kerbTexture(15, 256);
    const bark = barkTexture(16, 256);
    const tuftTex = grassTuftTexture(17);
    const leafTex = leafTexture(18);

    const leafMat = new THREE.MeshStandardMaterial({
      map: leafTex,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0,
    });
    const cutMat = brickMaterial(concrete);
    // Cut pieces carry their tint in vertex colours, so they need no instance jitter.
    cutMat.onBeforeCompile = () => {};
    this.assets = {
      brickGeo: wholeBrickGeometry(),
      boxGeo: boxBrickGeometry(),
      brickMat: brickMaterial(concrete),
      cutMat,
      sandMat: worldUvMaterial(sand, 1, { roughness: 1 }),
      dirtMat: worldUvMaterial(dirt, 1, {
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
      lawnMat: worldUvMaterial(lawn, 1, { roughness: 1 }),
      kerbGeo: kerbGeometry(),
      kerbMat: new THREE.MeshStandardMaterial({
        map: kerb.map,
        normalMap: kerb.normalMap,
        roughness: 0.9,
      }),
      palletGeo: palletGeometry(),
      woodMat: new THREE.MeshStandardMaterial({ map: woodTexture(19), roughness: 0.85 }),
      strapMat: new THREE.MeshStandardMaterial({
        color: 0x1f9a55,
        roughness: 0.5,
        side: THREE.DoubleSide,
      }),
      tuftGeo: tuftGeometry(),
      tuftMat: new THREE.MeshStandardMaterial({
        map: tuftTex,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
      trees: [treeGeometry(101), treeGeometry(202), treeGeometry(303)],
      barkMat: new THREE.MeshStandardMaterial({
        map: bark.map,
        normalMap: bark.normalMap,
        roughness: 0.95,
      }),
      leafMat,
      concrete,
    };

    // Sky and image-based light from it.
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u['turbidity']!.value = 5;
    u['rayleigh']!.value = 1.2;
    u['mieCoefficient']!.value = 0.004;
    u['mieDirectionalG']!.value = 0.82;
    const elevation = THREE.MathUtils.degToRad(47);
    const azimuth = THREE.MathUtils.degToRad(38);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    u['sunPosition']!.value.copy(sunDir);
    scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(4000);
    for (const k of Object.keys(u)) envSky.material.uniforms[k]!.value = u[k]!.value;
    envScene.add(envSky);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.2;
    pmrem.dispose();
    scene.fog = new THREE.Fog(0xd3dce4, 28, 105);

    this.sun = new THREE.DirectionalLight(0xffeedb, 3.1);
    this.sunOffset.copy(sunDir).multiplyScalar(30);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -9;
    sc.right = 9;
    sc.top = 9;
    sc.bottom = -9;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 2;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.add(new THREE.HemisphereLight(0xc8daf0, 0x8a7458, 0.55));

    // Lawn everywhere; the plane follows the player in whole texture tiles so it never swims.
    const groundGeo = new THREE.PlaneGeometry(260, 260);
    groundGeo.rotateX(-Math.PI / 2);
    const uv = groundGeo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 260) / 3, (uv.getY(i) * 260) / 3);
    this.ground = new THREE.Mesh(groundGeo, this.assets.lawnMat);
    this.ground.position.y = GROUND_Y;
    this.ground.receiveShadow = true;
    scene.add(this.ground);
  }

  /** Follow the player with the sun's shadow box and the ground plane. */
  follow(x: number, z: number): void {
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x, 0, z).add(this.sunOffset);
    this.ground.position.x = Math.round(x / 3) * 3;
    this.ground.position.z = Math.round(z / 3) * 3;
  }

  /** Load chunks around arc length s (at most one new chunk per call), drop distant ones. */
  stream(s: number): void {
    const kMin = Math.max(0, Math.floor((s - BEHIND) / CHUNK));
    const kMax = Math.floor((s + AHEAD) / CHUNK);
    for (const [k, v] of this.views) {
      if (k < kMin - 1 || k > kMax + 1) {
        this.scene.remove(v.group);
        for (const g of v.disposables) g.dispose();
        v.cutMesh?.geometry.dispose();
        v.full.dispose();
        v.pack.bricks.dispose();
        this.views.delete(k);
      }
    }
    // Nearest missing chunk first.
    const sk = Math.floor(Math.max(0, s) / CHUNK);
    let best: number | null = null;
    for (let k = kMin; k <= kMax; k++) {
      if (this.views.has(k)) continue;
      if (best === null || Math.abs(k - sk) < Math.abs(best - sk)) best = k;
    }
    if (best !== null) this.views.set(best, this.buildView(best));
    // Distant paving uses plain boxes; the chamfers only matter up close.
    for (const v of this.views.values()) {
      const mid = (v.chunk.s0 + v.chunk.s1) / 2;
      const geo = Math.abs(mid - s) < 14 ? this.assets.brickGeo : this.assets.boxGeo;
      if (v.full.geometry !== geo) v.full.geometry = geo;
    }
  }

  /** Synchronously load everything around s (at start-up). */
  streamAll(s: number): void {
    for (let i = 0; i < 40; i++) this.stream(s);
  }

  private buildView(k: number): ChunkView {
    const path = this.path;
    const a = this.assets;
    const chunk = buildChunk(path, k);
    const group = new THREE.Group();
    group.name = `chunk-${k}`;
    const disposables: THREE.BufferGeometry[] = [];
    let placed = this.state.placed.get(k);
    if (!placed || placed.length !== chunk.slots.length) {
      placed = new Uint8Array(chunk.slots.length);
      this.state.placed.set(k, placed);
    }

    // Laid whole blocks.
    const full = new THREE.InstancedMesh(a.brickGeo, a.brickMat, Math.max(1, chunk.fullCount));
    full.receiveShadow = true;
    full.castShadow = false;
    const fullIndex = new Int32Array(chunk.slots.length).fill(-1);
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let idx = 0;
    for (const slot of chunk.slots) {
      if (slot.kind !== 'full') continue;
      fullIndex[slot.i] = idx;
      full.setMatrixAt(idx, placed[slot.i] ? slotMatrix(slot, m) : zero);
      full.setColorAt(idx, brickTint(k * 4096 + slot.i));
      idx++;
    }
    full.instanceMatrix.needsUpdate = true;
    if (full.instanceColor) full.instanceColor.needsUpdate = true;
    full.computeBoundingSphere();
    full.frustumCulled = false;
    group.add(full);

    // Sand bed.
    const sand = this.ribbon(Math.max(0, chunk.s0), chunk.s1, [-1, 1], 0.012, () => 1);
    sand.translate(0, SAND_Y, 0);
    disposables.push(sand);
    const sandMesh = new THREE.Mesh(sand, a.sandMat);
    sandMesh.receiveShadow = true;
    group.add(sandMesh);

    // Disturbed soil either side of the kerbs, fading into the lawn.
    for (const side of [-1, 1] as const) {
      const dirt = this.dirtRibbon(Math.max(0, chunk.s0), chunk.s1, side);
      disposables.push(dirt);
      const dm = new THREE.Mesh(dirt, a.dirtMat);
      dm.receiveShadow = true;
      dm.renderOrder = -1;
      group.add(dm);
    }
    if (k === 0) {
      const apron = this.apron();
      disposables.push(apron);
      const am = new THREE.Mesh(apron, a.dirtMat);
      am.receiveShadow = true;
      am.renderOrder = -1;
      group.add(am);
    }

    // Kerbs.
    const kerbs = this.kerbMatrices(chunk);
    const kerbMesh = new THREE.InstancedMesh(a.kerbGeo, a.kerbMat, kerbs.length);
    kerbs.forEach((km, i) => kerbMesh.setMatrixAt(i, km));
    kerbMesh.castShadow = true;
    kerbMesh.receiveShadow = true;
    group.add(kerbMesh);

    const rnd = mulberry32(this.state.seed * 31 + k * 977);

    // A pack of blocks beside the path, alternating sides.
    const pack = this.buildPack(chunk, rnd);
    group.add(pack.group);

    // Scenery: trees, grass tufts.
    const trees: { x: number; z: number }[] = [];
    const addTree = (x: number, z: number, scale: number, bush: boolean): void => {
      const variant = a.trees[Math.floor(rnd() * a.trees.length)]!;
      const tree = new THREE.Group();
      const canopy = new THREE.Mesh(variant.canopy, a.leafMat);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      tree.add(canopy);
      if (bush) {
        // A shrub: just a low canopy sitting on the ground.
        canopy.position.y = -3.25;
        tree.scale.set(scale, scale * 0.75, scale);
      } else {
        const trunk = new THREE.Mesh(variant.trunk, a.barkMat);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        tree.add(trunk);
        tree.scale.setScalar(scale);
        trees.push({ x, z });
      }
      tree.position.set(x, GROUND_Y, z);
      tree.rotation.y = rnd() * Math.PI * 2;
      group.add(tree);
    };
    const clear = (x: number, z: number, s: number, margin: number): boolean => {
      const near = path.nearest(x, z, s - 45, s + 45);
      return near.dist > path.width(near.s) / 2 + margin;
    };
    const nTrees = rnd() < 0.55 ? 1 : rnd() < 0.5 ? 2 : 0;
    for (let t = 0; t < nTrees; t++) {
      const s = chunk.s0 + rnd() * CHUNK;
      const side = rnd() < 0.5 ? -1 : 1;
      const [x, z] = path.offset(s, side * (path.width(s) / 2 + 2.6 + rnd() * 5));
      if (clear(x, z, s, 2.2)) addTree(x, z, 0.9 + rnd() * 0.5, false);
    }
    // Further back: bigger trees and shrubs, so the garden doesn't end in bare lawn.
    for (let t = 0; t < 3; t++) {
      const s = chunk.s0 + rnd() * CHUNK;
      const side = rnd() < 0.5 ? -1 : 1;
      const [x, z] = path.offset(s, side * (path.width(s) / 2 + 9 + rnd() * 30));
      if (clear(x, z, s, 6)) addTree(x, z, 1.1 + rnd() * 0.9, false);
    }
    for (let t = 0; t < 2; t++) {
      const s = chunk.s0 + rnd() * CHUNK;
      const side = rnd() < 0.5 ? -1 : 1;
      const [x, z] = path.offset(s, side * (path.width(s) / 2 + 3.5 + rnd() * 12));
      if (clear(x, z, s, 2.5)) addTree(x, z, 0.35 + rnd() * 0.3, true);
    }
    const tuftCount = this.quality.tufts;
    if (tuftCount > 0) {
      const tufts = new THREE.InstancedMesh(a.tuftGeo, a.tuftMat, tuftCount);
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      let n = 0;
      for (let t = 0; t < tuftCount; t++) {
        const s = chunk.s0 + rnd() * CHUNK;
        const side = rnd() < 0.5 ? -1 : 1;
        const lat = side * (path.width(s) / 2 + 0.9 + rnd() ** 1.6 * 10);
        const [x, z] = path.offset(s, lat);
        const near = path.nearest(x, z, s - 14, s + 14);
        if (near.dist < path.width(near.s) / 2 + 0.6) continue;
        q.setFromAxisAngle(up, rnd() * Math.PI);
        const sc = 0.6 + rnd() * 0.9;
        tufts.setMatrixAt(
          n,
          m.compose(
            new THREE.Vector3(x, GROUND_Y, z),
            q,
            new THREE.Vector3(sc, sc * (0.7 + rnd() * 0.6), sc),
          ),
        );
        const g = 0.55 + rnd() * 0.35;
        tufts.setColorAt(n, new THREE.Color(g, g, g * 0.9));
        n++;
      }
      tufts.count = n;
      group.add(tufts);
    }

    this.scene.add(group);
    const view: ChunkView = {
      chunk,
      group,
      placed,
      full,
      fullIndex,
      cutMesh: null,
      pack,
      trees,
      disposables,
    };
    this.rebuildCuts(view);
    return view;
  }

  /** Ribbon along the path between lateral fractions of the half width. */
  private ribbon(
    s0: number,
    s1: number,
    lats: number[],
    extra: number,
    alpha: (col: number) => number,
  ): THREE.BufferGeometry {
    const path = this.path;
    const steps = Math.max(2, Math.ceil((s1 - s0) / 0.25));
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const cols = lats.length;
    for (let i = 0; i <= steps; i++) {
      const s = s0 + ((s1 - s0) * i) / steps;
      const half = path.width(s) / 2 + extra;
      for (let c = 0; c < cols; c++) {
        const [x, z] = path.offset(s, lats[c]! * half);
        pos.push(x, 0, z);
        uv.push(x / 1.6, z / 1.6);
        col.push(1, 1, 1, alpha(c));
      }
      if (i > 0) {
        for (let c = 0; c < cols - 1; c++) {
          const a0 = (i - 1) * cols + c;
          const b0 = i * cols + c;
          idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      }
    }
    return this.finishRibbon(pos, uv, col, idx);
  }

  private finishRibbon(
    pos: number[],
    uv: number[],
    col: number[],
    idx: number[],
  ): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Make sure the faces point up whatever the winding.
    const n = g.getAttribute('normal');
    if (n.count > 0 && n.getY(0) < 0) {
      const index = g.getIndex()!;
      for (let i = 0; i < index.count; i += 3) {
        const t = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, t);
      }
      g.computeVertexNormals();
    }
    return g;
  }

  private dirtRibbon(s0: number, s1: number, side: 1 | -1): THREE.BufferGeometry {
    const path = this.path;
    const offsets = [0.04, 0.9, 1.6, 2.5];
    const alphas = [1, 1, 0.55, 0];
    const steps = Math.max(2, Math.ceil((s1 - s0) / 0.5));
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const cols = offsets.length;
    for (let i = 0; i <= steps; i++) {
      const s = s0 + ((s1 - s0) * i) / steps;
      const half = path.width(s) / 2;
      // A ragged outer edge.
      const wob = Math.sin(s * 1.7 + side) * 0.25 + Math.sin(s * 0.53 + side * 2) * 0.35;
      for (let c = 0; c < cols; c++) {
        const lat = side * (half + offsets[c]! + (c > 1 ? wob : 0));
        const [x, z] = path.offset(s, lat);
        pos.push(x, GROUND_Y + 0.004, z);
        uv.push(x / 2.4, z / 2.4);
        col.push(1, 1, 1, alphas[c]!);
      }
      if (i > 0) {
        for (let c = 0; c < cols - 1; c++) {
          const a0 = (i - 1) * cols + c;
          const b0 = i * cols + c;
          idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      }
    }
    return this.finishRibbon(pos, uv, col, idx);
  }

  /** Bare ground behind the start, where the job begins. */
  private apron(): THREE.BufferGeometry {
    const path = this.path;
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const lats = [-4.2, -3, -1.5, 0, 1.5, 3, 4.2];
    const rows = [0.4, -1, -2.5, -4.5];
    const cols = lats.length;
    rows.forEach((s, r) => {
      lats.forEach((lat, c) => {
        const [x, z] = path.offset(s, lat);
        pos.push(x, GROUND_Y + 0.003, z);
        uv.push(x / 2.4, z / 2.4);
        const edge = c === 0 || c === cols - 1 || r === rows.length - 1;
        col.push(1, 1, 1, edge ? 0 : r === rows.length - 2 ? 0.6 : 1);
      });
      if (r > 0) {
        for (let c = 0; c < cols - 1; c++) {
          const a0 = (r - 1) * cols + c;
          const b0 = r * cols + c;
          idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      }
    });
    return this.finishRibbon(pos, uv, col, idx);
  }

  private kerbMatrices(chunk: Chunk): THREE.Matrix4[] {
    const path = this.path;
    const out: THREE.Matrix4[] = [];
    const unit = 0.8;
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const place = (ax: number, az: number, bx: number, bz: number): void => {
      const len = Math.hypot(bx - ax, bz - az) - 0.006;
      const ang = Math.atan2(bz - az, bx - ax);
      q.setFromAxisAngle(up, -ang);
      out.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2),
          q,
          new THREE.Vector3(len, 1, 1),
        ),
      );
    };
    const s0 = Math.max(0, chunk.s0);
    for (let s = s0; s < chunk.s1 - 1e-6; s += unit) {
      const sb = Math.min(chunk.s1, s + unit);
      for (const side of [-1, 1]) {
        const [ax, az] = path.offset(s, side * (path.width(s) / 2 + 0.035));
        const [bx, bz] = path.offset(sb, side * (path.width(sb) / 2 + 0.035));
        place(ax, az, bx, bz);
      }
    }
    if (chunk.k === 0) {
      // Header across the start of the path.
      const half = path.width(0) / 2 + 0.07;
      const n = 4;
      for (let i = 0; i < n; i++) {
        const [ax, az] = path.offset(-0.035, -half + (2 * half * i) / n);
        const [bx, bz] = path.offset(-0.035, -half + (2 * half * (i + 1)) / n);
        place(ax, az, bx, bz);
      }
    }
    return out;
  }

  private buildPack(chunk: Chunk, rnd: () => number): Pack {
    const path = this.path;
    const a = this.assets;
    const s = chunk.k === 0 ? 1.4 : chunk.s0 + 2;
    const side = chunk.k % 2 === 0 ? -1 : 1;
    const lat = side * (path.width(s) / 2 + 0.78);
    const [x, z] = path.offset(s, lat);
    const p = path.at(s);
    const group = new THREE.Group();
    group.position.set(x, GROUND_Y, z);
    group.rotation.y = -p.th + (rnd() - 0.5) * 0.12;
    const pallet = new THREE.Mesh(a.palletGeo, a.woodMat);
    pallet.castShadow = true;
    pallet.receiveShadow = true;
    group.add(pallet);
    const bricks = new THREE.InstancedMesh(a.boxGeo, a.brickMat, PACK_SIZE);
    const layout = packLayout();
    const tint = brickTint(chunk.k * 31 + 7);
    const taken = this.state.packTaken.get(chunk.k) ?? 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    layout.forEach((m, i) => {
      bricks.setMatrixAt(i, i < taken ? zero : m);
      const c = tint.clone().multiplyScalar(0.95 + ((i * 2654435761) % 100) / 1000);
      bricks.setColorAt(i, c);
    });
    bricks.castShadow = true;
    bricks.receiveShadow = true;
    bricks.frustumCulled = false;
    group.add(bricks);
    // Straps cut off the pack lie around it.
    for (let i = 0; i < 2; i++) {
      const strap = new THREE.Mesh(strapGeometry(rnd), a.strapMat);
      strap.position.set(
        (rnd() - 0.5) * 1.6,
        0.003,
        side * (0.5 + rnd() * 0.5) * (rnd() < 0.5 ? 1 : -1),
      );
      strap.receiveShadow = true;
      group.add(strap);
    }
    const pack: Pack = { k: chunk.k, group, bricks, taken, box: new THREE.Box3(), x, z };
    this.updatePackBox(pack);
    return pack;
  }

  updatePackBox(pack: Pack): void {
    const layers = Math.ceil((PACK_SIZE - pack.taken) / 50);
    const h = PALLET_H + layers * (BRICK_T + 0.001);
    pack.group.updateMatrixWorld(true);
    pack.box.setFromCenterAndSize(new THREE.Vector3(0, h / 2, 0), new THREE.Vector3(1.0, h, 1.0));
    pack.box.applyMatrix4(pack.group.matrixWorld);
  }

  /** Lift n blocks off the top of a pack; returns how many were taken. */
  takeFromPack(pack: Pack, n: number): number {
    const left = PACK_SIZE - pack.taken;
    const t = Math.min(n, left);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = pack.taken; i < pack.taken + t; i++) pack.bricks.setMatrixAt(i, zero);
    pack.bricks.instanceMatrix.needsUpdate = true;
    pack.taken += t;
    this.state.packTaken.set(pack.k, pack.taken);
    this.updatePackBox(pack);
    return t;
  }

  /** World position of the next block on top of a pack (for the grab animation). */
  packTopPosition(pack: Pack): THREE.Vector3 {
    const layout = packLayout();
    const m = layout[Math.min(PACK_SIZE - 1, pack.taken)]!;
    return new THREE.Vector3().setFromMatrixPosition(m).applyMatrix4(pack.group.matrixWorld);
  }

  /** Find the slot under a point on the paving plane. */
  slotAtPoint(x: number, z: number, sHint: number): { view: ChunkView; slot: Slot } | null {
    const n = this.path.nearest(x, z, sHint - 8, sHint + 8);
    const k0 = Math.floor(Math.max(0, n.s) / CHUNK);
    for (const k of [k0, k0 - 1, k0 + 1]) {
      const view = this.views.get(k);
      if (!view) continue;
      const slot = slotAt(view.chunk, x, z);
      if (slot) return { view, slot };
    }
    return null;
  }

  place(view: ChunkView, slot: Slot): void {
    if (view.placed[slot.i]) return;
    view.placed[slot.i] = 1;
    this.state.laid++;
    this.state.area += slot.kind === 'full' ? 0.02 : areaOf(slot);
    if (slot.kind === 'full') {
      const idx = view.fullIndex[slot.i]!;
      view.full.setMatrixAt(idx, slotMatrix(slot, new THREE.Matrix4()));
      view.full.instanceMatrix.needsUpdate = true;
    } else {
      this.rebuildCuts(view);
    }
  }

  private rebuildCuts(view: ChunkView): void {
    if (view.cutMesh) {
      view.group.remove(view.cutMesh);
      view.cutMesh.geometry.dispose();
      view.cutMesh = null;
    }
    const parts: THREE.BufferGeometry[] = [];
    for (const slot of view.chunk.slots) {
      if (slot.kind !== 'edge' || !view.placed[slot.i]) continue;
      const { geo, center } = cutPieceGeometry(slot, brickTint(view.chunk.k * 4096 + slot.i));
      geo.translate(center[0], -BRICK_T / 2, center[1]);
      parts.push(geo);
    }
    if (parts.length === 0) return;
    const merged = mergeGeometries(parts)!;
    for (const p of parts) p.dispose();
    const mesh = new THREE.Mesh(merged, this.assets.cutMat);
    mesh.receiveShadow = true;
    view.cutMesh = mesh;
    view.group.add(mesh);
  }

  /** Obstacles the player can't walk through. */
  colliders(): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    for (const v of this.views.values()) {
      out.push({ x: v.pack.x, z: v.pack.z, r: 0.72 });
      for (const t of v.trees) out.push({ x: t.x, z: t.z, r: 0.3 });
    }
    return out;
  }
}

function areaOf(slot: Slot): number {
  let a = 0;
  const r = slot.piece;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}
