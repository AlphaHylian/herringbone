/**
 * The first-person paving game: walking, looking, the gloved hands, picking up blocks, laying
 * them, marking edge gaps, cutting on the splitter, and saving as you go.
 */
import * as THREE from 'three';
import { difference, ensureCCW, type Ring } from '../core/geom';
import { SiteAudio } from './audio';
import {
  brickTint,
  cutPieceGeometry,
  PACK_SIZE,
  PAVE_Y,
  ringCentroid2,
  SAND_Y,
  slotMatrix,
  tintedBrick,
} from './bricks';
import { gloveMaterial, handGeometry, skinMaterial } from './hands';
import { Hud, type Settings } from './hud';
import { Input } from './input';
import { PathModel } from './path';
import { buildSplitter, type SplitterParts } from './props';
import { clearSite, loadSettings, loadSite, saveSettings, saveSite } from './save';
import { BRICK_T, cutEdges, type Slot } from './slots';
import { knitTexture } from './textures';
import { GROUND_Y, World, type ChunkView, type Pack, type Quality, type SiteState } from './world';

const CAP = 8;
const REACH = 2.5;
const PACK_REACH = 1.8;
const SPLIT_REACH = 2.0;
const KNEEL_EYE = 0.92;
const STAND_EYE = 1.62;
const MAX_DEBRIS = 60;

interface Ref {
  k: number;
  i: number;
}

type Target =
  | { kind: 'slot'; view: ChunkView; slot: Slot; dist: number; reach: boolean }
  | { kind: 'pack'; pack: Pack; dist: number; reach: boolean }
  | { kind: 'splitter'; dist: number; reach: boolean };

interface Flight {
  obj: THREE.Object3D;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  q0: THREE.Quaternion;
  q1: THREE.Quaternion;
  t: number;
  dur: number;
  arc: number;
  done: () => void;
}

interface SplitAnim {
  t: number;
  ref: Ref;
  slot: Slot;
  whole: THREE.Mesh;
  piece: THREE.Mesh;
  off: THREE.Mesh | null;
  offFrom: THREE.Vector3;
  offTo: THREE.Vector3;
  cracked: boolean;
}

const refKey = (r: Ref): string => `${r.k}:${r.i}`;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly world: World;
  readonly path: PathModel;
  readonly input: Input;
  readonly audio = new SiteAudio();
  readonly hud: Hud;
  private settings: Settings;

  // Player
  x = 0;
  z = 0;
  yaw = 0;
  pitch = -0.62;
  stand = false;
  private eye = KNEEL_EYE;
  private s = 0;
  private stepDist = 0;
  private bob = 0;
  private moving = 0;

  // What you're carrying
  whole = 0;
  marked: Ref[] = [];
  cut: Ref[] = [];
  private pending = new Set<string>();

  // Splitter
  private readonly splitter: SplitterParts;
  private carrying = false;
  private split: SplitAnim | null = null;
  private readonly splitBox = new THREE.Box3();
  private debris: THREE.Mesh[] = [];

  // Viewmodel
  private readonly vmScene = new THREE.Scene();
  private readonly vm = new THREE.Group();
  private readonly rightHand = new THREE.Group();
  private readonly leftHand = new THREE.Group();
  private readonly rightRest = new THREE.Vector3();
  private readonly leftRest = new THREE.Vector3();
  private readonly stack: THREE.Mesh[] = [];
  private readonly stackChalk: THREE.Mesh;
  private rightPiece: THREE.Mesh | null = null;
  private rightPieceKey = '';
  private reach = 0;
  private grabDip = 0;
  private leftShow = 0;

  // Targeting and effects
  private target: Target | null = null;
  private readonly ghost: THREE.Group;
  private readonly ghostFill: THREE.Mesh;
  private readonly ghostEdges: THREE.LineSegments;
  private readonly edgeGhost = new THREE.Group();
  private edgeGhostKey = '';
  private readonly chalk = new THREE.Group();
  private readonly chalkMarks = new Map<string, THREE.Object3D>();
  private flights: Flight[] = [];
  private sweepCooldown = 0;
  private hover: { x: number; y: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private dirty = false;
  private saveTimer = 0;
  private time = 0;
  private hintFlash = { text: '', t: 0 };
  private everSwept = false;
  ready = false;

  constructor(private readonly container: HTMLElement) {
    this.settings = loadSettings();
    const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const quality = this.qualityFor(touch);
    this.renderer = new THREE.WebGLRenderer({
      antialias: quality.shadowSize > 1024,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality.shadowSize > 1024 ? 2 : 1.5),
    );
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.58;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ?shadows=0 turns shadows off (software-rendered test browsers are very slow with them).
    this.renderer.shadowMap.enabled = new URLSearchParams(location.search).get('shadows') !== '0';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.03, 600);
    this.camera.rotation.order = 'YXZ';

    const saved = loadSite();
    const state: SiteState = saved?.state ?? {
      seed: (Math.random() * 1e9) >>> 0,
      placed: new Map(),
      packTaken: new Map(),
      laid: 0,
      area: 0,
    };
    this.path = new PathModel(state.seed);
    this.world = new World(this.scene, this.renderer, this.path, state, quality);

    // Splitter
    this.splitter = buildSplitter();
    this.scene.add(this.splitter.root);
    this.splitter.lever.rotation.x = -0.55;
    if (saved?.splitter) {
      this.splitter.root.position.set(saved.splitter.x, GROUND_Y, saved.splitter.z);
      this.splitter.root.rotation.y = saved.splitter.yaw;
    } else {
      const s = 0.4;
      const p = this.path.at(s);
      const [x, z] = this.path.offset(s, this.path.width(s) / 2 + 0.75);
      this.splitter.root.position.set(x, GROUND_Y, z);
      this.splitter.root.rotation.y = -p.th;
    }

    // Player
    if (saved?.player) {
      this.x = saved.player.x;
      this.z = saved.player.z;
      this.yaw = saved.player.yaw;
      this.pitch = saved.player.pitch;
      this.stand = saved.player.stand;
      this.whole = Math.min(CAP, saved.player.whole);
      this.eye = this.stand ? STAND_EYE : KNEEL_EYE;
    } else {
      const [x, z] = this.path.offset(-1.4, -0.3);
      this.x = x;
      this.z = z;
      this.yaw = 0.25;
    }
    this.s = this.path.nearest(this.x, this.z, -10, 4000).s;

    // Effects
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    this.ghostFill = new THREE.Mesh(this.world.assets.brickGeo, ghostMat);
    this.ghostEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.world.assets.brickGeo, 30),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
    );
    this.ghost = new THREE.Group();
    this.ghost.add(this.ghostFill, this.ghostEdges);
    this.ghost.visible = false;
    this.scene.add(this.ghost, this.edgeGhost, this.chalk);

    // Viewmodel
    this.stackChalk = this.buildViewmodel();

    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(this.input.touch, this.settings);
    this.audio.setVolume(this.settings.volume, this.settings.muted);
    this.bindUi();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.world.streamAll(this.s);
    this.updateCamera(0);
    this.ready = true;
  }

  private qualityFor(touch: boolean): Quality {
    // ?quality=low|high overrides the setting (handy for testing).
    const param = new URLSearchParams(location.search).get('quality');
    const chosen = param === 'low' || param === 'high' ? param : this.settings.quality;
    const q = chosen === 'auto' ? (touch ? 'low' : 'high') : chosen;
    return q === 'high'
      ? { shadowSize: 2048, tufts: 240, texSize: 512 }
      : { shadowSize: 1024, tufts: 110, texSize: 256 };
  }

  private bindUi(): void {
    const hud = this.hud;
    hud.onStart = () => {
      this.audio.unlock();
      hud.hideStart();
      this.input.requestLock();
    };
    hud.onResume = () => {
      this.audio.unlock();
      this.input.requestLock();
    };
    hud.onSettings = (s) => {
      this.settings = s;
      saveSettings(s);
      this.audio.setVolume(s.volume, s.muted);
    };
    hud.onNewSite = () => {
      clearSite();
      location.reload();
    };
    hud.standBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleStand();
    });
    this.input.onUnlock = () => {
      if (hud.started) hud.showMenu(true);
    };
    this.input.onAction = (e) => {
      if (!hud.started || hud.menuOpen) return;
      this.audio.unlock();
      const t = this.pick(e.x, e.y);
      this.act(t, false);
    };
    this.input.onKey = (code) => {
      if (!hud.started || hud.menuOpen) return;
      if (code === 'KeyC' || code === 'ControlLeft') this.toggleStand();
      if (code === 'KeyE' || code === 'Space') this.act(this.pick(null, null), false);
    };
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && !this.input.locked)
        this.hover = { x: e.clientX, y: e.clientY };
    });
    this.renderer.domElement.addEventListener('pointerleave', () => (this.hover = null));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());
  }

  private toggleStand(): void {
    this.stand = !this.stand;
    this.hud.standBtn.textContent = this.stand ? 'Kneel' : 'Stand';
    this.dirty = true;
  }

  private buildViewmodel(): THREE.Mesh {
    const vs = this.vmScene;
    vs.environment = this.scene.environment;
    vs.environmentIntensity = this.scene.environmentIntensity;
    const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
    sun.position.copy(this.world.sun.position).sub(this.world.sun.target.position);
    vs.add(sun);
    vs.add(new THREE.HemisphereLight(0xc8daf0, 0x8a7458, 0.55));
    vs.add(this.vm);

    const knit = knitTexture(21);
    const glove = gloveMaterial(knit);
    const skin = skinMaterial();
    const right = handGeometry(-1, 0.2, -0.6);
    const left = handGeometry(1, 0.1, -0.2);
    this.rightHand.add(new THREE.Mesh(right.glove, glove), new THREE.Mesh(right.arm, skin));
    this.leftHand.add(new THREE.Mesh(left.glove, glove), new THREE.Mesh(left.arm, skin));
    this.vm.add(this.rightHand, this.leftHand);

    // Blocks resting on the upturned left palm.
    const mat = this.world.assets.brickMat.clone();
    mat.onBeforeCompile = () => {};
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(tintedBrick(this.world.assets.brickGeo, brickTint(900 + i)), mat);
      b.position.set(-0.04, -0.022 - BRICK_T / 2 - i * (BRICK_T + 0.002), -0.1);
      // The hand is turned palm-up, so turn the blocks back over to keep their tops up.
      b.rotation.set(0, 0.04 * (i - 1), Math.PI);
      this.leftHand.add(b);
      this.stack.push(b);
    }
    // Chalk line across the top block when it's marked.
    const chalk = new THREE.Mesh(
      new THREE.PlaneGeometry(0.004, 0.11).rotateX(Math.PI / 2).rotateY(0.6),
      new THREE.MeshBasicMaterial({ color: 0xf4f1ea }),
    );
    chalk.visible = false;
    this.leftHand.add(chalk);
    return chalk;
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    // Keep a comfortable horizontal field of view on portrait phones.
    const hfov = THREE.MathUtils.degToRad(aspect < 1 ? 78 : 100);
    let vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    vfov = Math.min(aspect < 1 ? 100 : 70, Math.max(55, vfov));
    this.camera.fov = vfov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    const d = 0.55;
    const halfH = d * Math.tan(THREE.MathUtils.degToRad(vfov / 2));
    const halfW = halfH * aspect;
    // On narrow portrait screens shrink the hands a little so they don't fill the view.
    const scale = THREE.MathUtils.clamp((halfW * 2) / 0.75, 0.78, 1.15);
    this.rightRest.set(Math.min(halfW * 0.56, 0.24), -halfH * 0.66, -d);
    this.leftRest.set(-Math.min(halfW * 0.62, 0.26), -halfH * 0.74, -d - 0.04);
    this.rightHand.scale.setScalar(scale);
    this.leftHand.scale.setScalar(scale);
    this.rightHand.rotation.set(0.3, 0.35, -0.25, 'YXZ');
    this.leftHand.rotation.set(0.35, -0.3, Math.PI + 0.35, 'YXZ');
  }

  // ---- Frame ------------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    const active = this.hud.started && !this.hud.menuOpen;
    if (active) {
      this.updatePlayer(dt);
      this.updateTarget();
      this.updateSweep(dt);
    } else {
      this.input.consumeLook();
    }
    this.updateSplitter(dt);
    this.updateFlights(dt);
    this.updateCamera(dt);
    this.updateViewmodel(dt);
    this.updateChalk();
    this.world.follow(this.x, this.z);
    this.world.stream(this.s);
    this.audio.update(dt);
    this.updateHud(dt);

    this.saveTimer += dt;
    if (this.dirty && this.saveTimer > 4) this.save();
  }

  render(): void {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.vmScene, this.camera);
  }

  private updatePlayer(dt: number): void {
    const { dx, dy } = this.input.consumeLook();
    const sens =
      (this.input.touch && !this.input.locked ? 0.0048 : 0.0024) * this.settings.sensitivity;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -1.48, 0.6);

    const k = this.input.keys;
    let fx = 0;
    let fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA')) fx -= 1;
    if (k.has('KeyD')) fx += 1;
    if (k.has('ArrowLeft')) this.yaw += dt * 1.8;
    if (k.has('ArrowRight')) this.yaw -= dt * 1.8;
    fx += this.input.moveX;
    fz += this.input.moveY;
    const l = Math.hypot(fx, fz);
    if (l > 1) {
      fx /= l;
      fz /= l;
    }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') ? 1.6 : 1;
    const speed = (this.stand ? 2.3 : 1.35) * run * (this.carrying ? 0.8 : 1);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Camera forward is (-sin, -cos), right is (cos, -sin).
    const vx = (fx * cos + fz * sin) * speed;
    const vz = (-fx * sin + fz * cos) * speed;
    const ox = this.x;
    const oz = this.z;
    this.x += vx * dt;
    this.z += vz * dt;

    // Obstacles.
    for (const c of this.world.colliders()) {
      const ddx = this.x - c.x;
      const ddz = this.z - c.z;
      const d = Math.hypot(ddx, ddz);
      const r = c.r + 0.25;
      if (d < r && d > 1e-6) {
        this.x = c.x + (ddx / d) * r;
        this.z = c.z + (ddz / d) * r;
      }
    }
    if (!this.carrying) {
      const sp = this.splitter.root.position;
      const ddx = this.x - sp.x;
      const ddz = this.z - sp.z;
      const d = Math.hypot(ddx, ddz);
      if (d < 0.6 && d > 1e-6) {
        this.x = sp.x + (ddx / d) * 0.6;
        this.z = sp.z + (ddz / d) * 0.6;
      }
    }

    // Stay near the path.
    const n = this.path.nearest(this.x, this.z, this.s - 8, this.s + 8);
    const limit = this.path.width(Math.max(0, n.s)) / 2 + 6;
    if (Math.abs(n.lat) > limit || n.s < -6) {
      this.x = ox;
      this.z = oz;
    } else {
      this.s = n.s;
    }

    const moved = Math.hypot(this.x - ox, this.z - oz);
    this.moving = THREE.MathUtils.lerp(this.moving, moved > 1e-4 ? 1 : 0, 1 - Math.exp(-dt * 10));
    this.bob += moved * (this.stand ? 5.2 : 7);
    this.stepDist += moved;
    if (this.stepDist > (this.stand ? 0.7 : 0.5)) {
      this.stepDist = 0;
      this.audio.step();
    }
    if (moved > 0) this.dirty = true;

    if (this.carrying) {
      const sp = this.splitter.root;
      const tx = this.x - sin * 1.05;
      const tz = this.z - cos * 1.05;
      const f = 1 - Math.exp(-dt * 8);
      sp.position.x += (tx - sp.position.x) * f;
      sp.position.z += (tz - sp.position.z) * f;
      sp.rotation.y = this.yaw;
    }
  }

  private updateCamera(dt: number): void {
    const targetEye = this.stand ? STAND_EYE : KNEEL_EYE;
    this.eye += (targetEye - this.eye) * (1 - Math.exp(-dt * 6));
    const bobY = Math.sin(this.bob) * 0.012 * this.moving;
    this.camera.position.set(this.x, GROUND_Y + this.eye + bobY, this.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
  }

  // ---- Targeting ----------------------------------------------------------------------------

  /** What's under a screen point (or the crosshair when x is null). */
  private pick(sx: number | null, sy: number | null): Target | null {
    const ndc = new THREE.Vector2(0, 0);
    if (sx !== null && sy !== null) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      ndc.set(((sx - rect.left) / rect.width) * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1);
    }
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const eye = this.camera.position;
    let best: Target | null = null;
    const hit = new THREE.Vector3();

    for (const v of this.world.views.values()) {
      const pack = v.pack;
      if (pack.taken >= PACK_SIZE) continue;
      if (!ray.intersectBox(pack.box, hit)) continue;
      const dist = hit.distanceTo(eye);
      if (dist > 8) continue;
      const flat = Math.hypot(this.x - pack.x, this.z - pack.z) - 0.5;
      if (!best || dist < best.dist) best = { kind: 'pack', pack, dist, reach: flat < PACK_REACH };
    }

    this.splitter.root.updateMatrixWorld(true);
    this.splitBox.setFromObject(this.splitter.root).expandByScalar(0.03);
    if (ray.intersectBox(this.splitBox, hit)) {
      const dist = hit.distanceTo(eye);
      const sp = this.splitter.root.position;
      const flat = Math.hypot(this.x - sp.x, this.z - sp.z);
      if (dist < 8 && (!best || dist < best.dist))
        best = { kind: 'splitter', dist, reach: flat < SPLIT_REACH || this.carrying };
    }

    if (ray.direction.y < -0.02) {
      const t = (PAVE_Y - ray.origin.y) / ray.direction.y;
      if (t > 0 && t < 9 && (!best || t < best.dist)) {
        const p = ray.at(t, new THREE.Vector3());
        const found = this.world.slotAtPoint(p.x, p.z, this.s);
        if (found) {
          const flat = Math.hypot(found.slot.x - this.x, found.slot.z - this.z);
          best = { kind: 'slot', view: found.view, slot: found.slot, dist: t, reach: flat < REACH };
        }
      }
    }
    return best;
  }

  private hoverPoint(): { x: number | null; y: number | null } | null {
    if (this.input.sweep && !this.input.locked)
      return { x: this.input.sweep.x, y: this.input.sweep.y };
    if (this.input.locked) return { x: null, y: null };
    if (this.input.touch) return null;
    if (this.hover) return this.hover;
    return null;
  }

  private updateTarget(): void {
    const hp = this.hoverPoint();
    this.target = hp ? this.pick(hp.x, hp.y) : null;
    const t = this.target;
    this.ghost.visible = false;
    let edgeKey = '';
    if (
      t?.kind === 'slot' &&
      !t.view.placed[t.slot.i] &&
      !this.pending.has(refKey({ k: t.view.chunk.k, i: t.slot.i }))
    ) {
      const ok = t.reach && this.canFill(t);
      if (t.slot.kind === 'full') {
        this.ghost.visible = true;
        slotMatrix(t.slot, this.ghost.matrix, 0.0015);
        this.ghost.matrix.decompose(this.ghost.position, this.ghost.quaternion, this.ghost.scale);
        (this.ghostFill.material as THREE.MeshBasicMaterial).opacity = ok ? 0.28 : 0.1;
        (this.ghostEdges.material as THREE.LineBasicMaterial).opacity = ok ? 0.9 : 0.3;
      } else {
        edgeKey = `${t.view.chunk.k}:${t.slot.i}:${ok ? 1 : 0}`;
        if (edgeKey !== this.edgeGhostKey) this.buildEdgeGhost(t.slot, ok);
      }
    }
    if (!edgeKey && this.edgeGhostKey) {
      this.edgeGhost.clear();
      this.edgeGhostKey = '';
    } else {
      this.edgeGhostKey = edgeKey;
    }
  }

  private canFill(t: Target & { kind: 'slot' }): boolean {
    const ref = { k: t.view.chunk.k, i: t.slot.i };
    if (t.slot.kind === 'full') return this.whole > 0;
    if (this.cut.some((r) => refKey(r) === refKey(ref))) return true;
    if (this.marked.some((r) => refKey(r) === refKey(ref))) return false;
    return this.whole > 0;
  }

  private buildEdgeGhost(slot: Slot, ok: boolean): void {
    for (const c of this.edgeGhost.children) {
      if (c instanceof THREE.Mesh || c instanceof THREE.Line) c.geometry.dispose();
    }
    this.edgeGhost.clear();
    const y = PAVE_Y + 0.002;
    // Faint outline of the whole block it'll be cut from.
    this.edgeGhost.add(ringLine(slot.rect, y, 0xffffff, ok ? 0.28 : 0.12, true));
    // The gap itself.
    const shape = new THREE.Shape(slot.piece.map((p) => new THREE.Vector2(p[0], -p[1])));
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: ok ? 0.22 : 0.08,
        depthWrite: false,
      }),
    );
    this.edgeGhost.add(fill);
    this.edgeGhost.add(ringLine(slot.piece, y + 0.001, 0xffffff, ok ? 0.95 : 0.35, false));
  }

  // ---- Actions ------------------------------------------------------------------------------

  private verb(): string {
    return this.input.touch ? 'Tap' : 'Click';
  }

  private flash(text: string): void {
    this.hintFlash = { text, t: 1.8 };
  }

  private act(t: Target | null, sweep: boolean): boolean {
    if (this.carrying) {
      if (sweep) return false;
      this.carrying = false;
      this.audio.thud();
      this.dirty = true;
      return true;
    }
    if (!t) return false;
    if (t.kind === 'pack') {
      if (sweep) return false;
      if (!t.reach) {
        this.flash('Get a little closer to the pack.');
        return false;
      }
      const room = CAP - this.whole - this.marked.length - this.cut.length;
      if (room <= 0) {
        this.flash('Your hands are full. Lay some first.');
        return false;
      }
      const n = this.world.takeFromPack(t.pack, room);
      this.whole += n;
      this.grabDip = 1;
      this.audio.grab(n);
      this.dirty = true;
      return true;
    }
    if (t.kind === 'splitter') {
      if (!t.reach) {
        if (!sweep) this.flash('Walk over to the splitter.');
        return false;
      }
      if (this.marked.length > 0) {
        if (this.split) return false;
        this.startSplit();
        return true;
      }
      if (sweep) return false;
      if (this.split) return false;
      this.carrying = true;
      this.audio.click();
      return true;
    }
    // Slot
    const { view, slot } = t;
    const ref = { k: view.chunk.k, i: slot.i };
    const key = refKey(ref);
    if (view.placed[slot.i] || this.pending.has(key)) return false;
    if (!t.reach) {
      if (!sweep) this.flash('Move a little closer.');
      return false;
    }
    if (slot.kind === 'full') {
      if (this.whole <= 0) {
        if (!sweep)
          this.flash(
            this.cut.length
              ? 'Cut pieces go in the marked gaps by the kerb.'
              : 'Pick up some blocks from a pack first.',
          );
        return false;
      }
      this.whole--;
      this.layWhole(view, slot);
      return true;
    }
    const ci = this.cut.findIndex((r) => refKey(r) === key);
    if (ci >= 0) {
      this.cut.splice(ci, 1);
      this.layCut(view, slot);
      return true;
    }
    if (sweep) return false;
    if (this.marked.some((r) => refKey(r) === key)) {
      this.flash('Already marked. Cut it on the splitter.');
      return false;
    }
    if (this.whole <= 0) {
      this.flash('Pick up a block to mark for this gap.');
      return false;
    }
    this.whole--;
    this.marked.push(ref);
    this.audio.mark();
    this.grabDip = 0.6;
    this.dirty = true;
    return true;
  }

  private updateSweep(dt: number): void {
    this.sweepCooldown -= dt;
    if (!this.input.holding || this.sweepCooldown > 0) return;
    const hp = this.input.locked ? { x: null, y: null } : this.input.sweep;
    if (!hp) return;
    const t = this.pick(hp.x, hp.y);
    if (t && this.act(t, true)) {
      this.sweepCooldown = 0.085;
      if (t.kind === 'slot') this.everSwept = true;
    }
  }

  private handWorld(hand: 'left' | 'right'): THREE.Vector3 {
    this.vm.updateMatrixWorld(true);
    return hand === 'left'
      ? this.stack[0]!.getWorldPosition(new THREE.Vector3())
      : this.rightHand.localToWorld(new THREE.Vector3(0, -0.05, -0.08));
  }

  private layWhole(view: ChunkView, slot: Slot): void {
    const ref = { k: view.chunk.k, i: slot.i };
    const key = refKey(ref);
    this.pending.add(key);
    const mesh = new THREE.Mesh(
      tintedBrick(this.world.assets.brickGeo, brickTint(view.chunk.k * 4096 + slot.i)),
      this.world.assets.cutMat,
    );
    const p0 = this.handWorld('left');
    const q0 = this.stack[0]!.getWorldQuaternion(new THREE.Quaternion());
    const m = slotMatrix(slot, new THREE.Matrix4());
    const p1 = new THREE.Vector3();
    const q1 = new THREE.Quaternion();
    m.decompose(p1, q1, new THREE.Vector3());
    this.reach = 1;
    this.fly(mesh, p0, q0, p1, q1, 0.2, () => {
      this.pending.delete(key);
      this.world.place(view, slot);
      mesh.geometry.dispose();
      this.audio.lay();
      this.dirty = true;
    });
  }

  private layCut(view: ChunkView, slot: Slot): void {
    const ref = { k: view.chunk.k, i: slot.i };
    const key = refKey(ref);
    this.pending.add(key);
    const { geo, center } = cutPieceGeometry(slot, brickTint(view.chunk.k * 4096 + slot.i));
    const mesh = new THREE.Mesh(geo, this.world.assets.cutMat);
    const p0 = this.handWorld('right');
    const q0 = this.rightPiece
      ? this.rightPiece.getWorldQuaternion(new THREE.Quaternion())
      : new THREE.Quaternion();
    const p1 = new THREE.Vector3(center[0], PAVE_Y - BRICK_T / 2, center[1]);
    this.reach = 1;
    this.fly(mesh, p0, q0, p1, new THREE.Quaternion(), 0.24, () => {
      this.pending.delete(key);
      this.world.place(view, slot);
      geo.dispose();
      this.audio.lay();
      this.dirty = true;
    });
  }

  private fly(
    obj: THREE.Mesh,
    p0: THREE.Vector3,
    q0: THREE.Quaternion,
    p1: THREE.Vector3,
    q1: THREE.Quaternion,
    dur: number,
    done: () => void,
  ): void {
    obj.position.copy(p0);
    obj.quaternion.copy(q0);
    obj.castShadow = true;
    this.scene.add(obj);
    this.flights.push({ obj, p0, p1, q0, q1, t: 0, dur, arc: 0.1, done });
  }

  private updateFlights(dt: number): void {
    for (const f of this.flights) {
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = 1 - (1 - f.t) ** 3;
      f.obj.position.lerpVectors(f.p0, f.p1, e);
      f.obj.position.y += Math.sin(Math.PI * f.t) * f.arc;
      f.obj.quaternion.slerpQuaternions(f.q0, f.q1, Math.min(1, e * 1.2));
      if (f.t >= 1) {
        this.scene.remove(f.obj);
        f.done();
      }
    }
    this.flights = this.flights.filter((f) => f.t < 1);
  }

  // ---- Splitter -----------------------------------------------------------------------------

  private findSlot(ref: Ref): { view: ChunkView; slot: Slot } | null {
    const view = this.world.views.get(ref.k);
    const slot = view?.chunk.slots[ref.i];
    return view && slot ? { view, slot } : null;
  }

  private startSplit(): void {
    const ref = this.marked[0]!;
    const found = this.findSlot(ref);
    if (!found) {
      // The gap's chunk was unloaded (you walked far away): give the block back.
      this.marked.shift();
      this.whole++;
      return;
    }
    const { slot } = found;
    const tint = brickTint(ref.k * 4096 + ref.i);
    const assets = this.world.assets;
    // Orientation: put the (first) cut line under the blade, along the splitter's x axis.
    const cuts = cutEdges(slot);
    const [a, b] = cuts[0] ?? [slot.piece[0]!, slot.piece[1]!];
    const lineAng = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const center = ringCentroid2(slot.piece);
    // Signed offset of the cut line from the piece centroid, perpendicular to the line.
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    const off = ((center[0] - a[0]) * -dz + (center[1] - a[1]) * dx) / l;

    const root = this.splitter.root;
    const bed = this.splitter.bed;
    const whole = new THREE.Mesh(tintedBrick(assets.brickGeo, tint), assets.cutMat);
    // Whole block centred on the line.
    const wholeAng = slot.angle;
    whole.rotation.y = -(wholeAng - lineAng);
    whole.position.set(bed.x, bed.y + BRICK_T / 2 + 0.03, bed.z);
    root.add(whole);
    whole.castShadow = true;

    const { geo } = cutPieceGeometry(slot, tint);
    const piece = new THREE.Mesh(geo, assets.cutMat);
    piece.rotation.y = lineAng;
    piece.position.set(bed.x, bed.y + BRICK_T / 2 + 0.03, bed.z + off);
    piece.visible = false;
    piece.castShadow = true;
    root.add(piece);

    // The offcut: the rest of the block.
    let offMesh: THREE.Mesh | null = null;
    const rest = difference([slot.rect], [slot.piece]);
    let bestRing: Ring | null = null;
    let bestArea = 0;
    for (const poly of rest) {
      const r = poly[0];
      if (!r || r.length < 3) continue;
      const ar = Math.abs(ringAreaSigned(r));
      if (ar > bestArea) {
        bestArea = ar;
        bestRing = r;
      }
    }
    if (bestRing && bestArea > 0.0004) {
      const offSlot: Slot = { ...slot, piece: ensureCCW(bestRing) };
      const og = cutPieceGeometry(offSlot, tint);
      offMesh = new THREE.Mesh(og.geo, assets.cutMat);
      const offCenter = og.center;
      const rel = [offCenter[0] - a[0], offCenter[1] - a[1]];
      const offOff = (rel[0]! * -dz + rel[1]! * dx) / l;
      offMesh.rotation.y = lineAng;
      offMesh.position.set(bed.x, bed.y + BRICK_T / 2 + 0.03, bed.z + offOff);
      offMesh.visible = false;
      offMesh.castShadow = true;
      root.add(offMesh);
    }
    const side = Math.random() < 0.5 ? -1 : 1;
    this.split = {
      t: 0,
      ref,
      slot,
      whole,
      piece,
      off: offMesh,
      offFrom: offMesh ? offMesh.position.clone() : new THREE.Vector3(),
      offTo: new THREE.Vector3(
        side * (0.35 + Math.random() * 0.25),
        GROUND_Y + BRICK_T / 2 - root.position.y,
        0.15 + Math.random() * 0.3,
      ),
      cracked: false,
    };
    this.marked.shift();
    this.reach = 1;
    this.dirty = true;
  }

  private updateSplitter(dt: number): void {
    const s = this.split;
    const lever = this.splitter.lever;
    const blade = this.splitter.blade;
    if (!s) {
      lever.rotation.x += (-0.55 - lever.rotation.x) * (1 - Math.exp(-dt * 10));
      blade.position.y = 0.7 + (lever.rotation.x + 0.55) * -0.15;
      return;
    }
    const prev = s.t;
    s.t += dt;
    const t = s.t;
    // Lever down 0.12-0.42, crack at 0.42, back up by 0.8.
    let lv: number;
    if (t < 0.12) lv = -0.55;
    else if (t < 0.42) lv = -0.55 + ((t - 0.12) / 0.3) ** 2 * 0.68;
    else lv = 0.13 - Math.min(1, (t - 0.42) / 0.35) * 0.68;
    lever.rotation.x = lv;
    blade.position.y = 0.7 - Math.max(0, (lv + 0.55) / 0.68) * 0.075;
    if (prev < 0.26 && t >= 0.26) this.audio.split();
    if (!s.cracked && t >= 0.42) {
      s.cracked = true;
      s.whole.removeFromParent();
      s.whole.geometry.dispose();
      s.piece.visible = true;
      if (s.off) s.off.visible = true;
    }
    if (s.cracked && s.off) {
      const u = Math.min(1, (t - 0.42) / 0.38);
      s.off.position.lerpVectors(s.offFrom, s.offTo, u);
      s.off.position.y += Math.sin(Math.PI * u) * 0.12;
      s.off.rotation.z = u * 1.4 * (s.offTo.x > 0 ? -1 : 1) * (1 - u) * 2;
    }
    if (s.cracked) {
      const u = Math.min(1, (t - 0.5) / 0.3);
      if (u > 0) s.piece.position.y = this.splitter.bed.y + BRICK_T / 2 + 0.03 + u * 0.25;
    }
    if (t >= 0.85) {
      s.piece.removeFromParent();
      s.piece.geometry.dispose();
      if (s.off) {
        // Leave the offcut lying on the ground, in world space.
        const off = s.off;
        off.rotation.z = 0;
        off.position.copy(s.offTo);
        this.splitter.root.updateMatrixWorld(true);
        off.applyMatrix4(this.splitter.root.matrixWorld);
        this.splitter.root.remove(off);
        off.position.y = GROUND_Y + BRICK_T / 2;
        off.rotation.y += Math.random() * 0.6;
        off.receiveShadow = true;
        this.scene.add(off);
        this.debris.push(off);
        if (this.debris.length > MAX_DEBRIS) {
          const old = this.debris.shift()!;
          this.scene.remove(old);
          old.geometry.dispose();
        }
      }
      this.cut.push(s.ref);
      this.split = null;
      this.grabDip = 0.5;
    }
  }

  // ---- Viewmodel ----------------------------------------------------------------------------

  private updateViewmodel(dt: number): void {
    this.vm.position.copy(this.camera.position);
    this.vm.quaternion.copy(this.camera.quaternion);
    const k = 1 - Math.exp(-dt * 12);
    this.reach = Math.max(0, this.reach - dt * 4.5);
    this.grabDip = Math.max(0, this.grabDip - dt * 3);
    const r = Math.sin(Math.PI * Math.min(1, this.reach)) * (this.reach > 0 ? 1 : 0);
    const bx = Math.cos(this.bob * 0.5) * 0.008 * this.moving;
    const by = Math.abs(Math.sin(this.bob * 0.5)) * 0.01 * this.moving;
    const breathe = Math.sin(this.time * 1.3) * 0.003;

    this.rightHand.position.set(
      this.rightRest.x - r * 0.06 + bx,
      this.rightRest.y + r * 0.02 + by + breathe - (this.carrying ? 0.03 : 0),
      this.rightRest.z - r * 0.12,
    );
    const carrying = this.whole + this.marked.length;
    const want = carrying > 0 ? 1 : 0;
    this.leftShow += (want - this.leftShow) * k;
    const dip = Math.sin(Math.PI * this.grabDip) * 0.04;
    this.leftHand.position.set(
      this.leftRest.x - bx,
      this.leftRest.y - (1 - this.leftShow) * 0.25 - dip + by + breathe,
      this.leftRest.z,
    );
    this.leftHand.visible = this.leftShow > 0.02;
    for (let i = 0; i < this.stack.length; i++) this.stack[i]!.visible = i < carrying;
    // The top block shows the chalk line when the next one to use is marked.
    const top = Math.min(this.stack.length, carrying) - 1;
    this.stackChalk.visible = this.marked.length > 0 && top >= 0;
    if (top >= 0) {
      const b = this.stack[top]!;
      this.stackChalk.position.set(b.position.x, b.position.y - BRICK_T / 2 - 0.0008, b.position.z);
      this.stackChalk.rotation.set(0, 0, Math.PI);
    }

    // Cut piece in the right hand.
    const want2 = this.cut[0] ? refKey(this.cut[0]) : '';
    if (want2 !== this.rightPieceKey) {
      if (this.rightPiece) {
        this.rightHand.remove(this.rightPiece);
        this.rightPiece.geometry.dispose();
        this.rightPiece = null;
      }
      const found = this.cut[0] ? this.findSlot(this.cut[0]) : null;
      if (found) {
        const { geo } = cutPieceGeometry(
          found.slot,
          brickTint(found.view.chunk.k * 4096 + found.slot.i),
        );
        const mat = this.stack[0]!.material as THREE.Material;
        this.rightPiece = new THREE.Mesh(geo, mat);
        this.rightPiece.position.set(0, -0.06, -0.075);
        this.rightPiece.rotation.y = found.slot.angle;
        this.rightHand.add(this.rightPiece);
      }
      this.rightPieceKey = want2;
    }
  }

  // ---- Chalk marks on the bed ---------------------------------------------------------------

  private updateChalk(): void {
    const want = new Map<string, { ref: Ref; kind: 'marked' | 'cut' }>();
    for (const r of this.marked) want.set(refKey(r), { ref: r, kind: 'marked' });
    if (this.split) want.set(refKey(this.split.ref), { ref: this.split.ref, kind: 'marked' });
    for (const r of this.cut) want.set(refKey(r), { ref: r, kind: 'cut' });
    for (const [key, obj] of this.chalkMarks) {
      const w = want.get(key);
      if (!w || obj.userData['kind'] !== w.kind) {
        this.chalk.remove(obj);
        obj.traverse((o) => {
          if (o instanceof THREE.Line || o instanceof THREE.Mesh) o.geometry.dispose();
        });
        this.chalkMarks.delete(key);
      }
    }
    for (const [key, w] of want) {
      if (this.chalkMarks.has(key)) continue;
      const found = this.findSlot(w.ref);
      if (!found) continue;
      const g = new THREE.Group();
      g.userData['kind'] = w.kind;
      const y = SAND_Y + 0.003;
      const color = w.kind === 'cut' ? 0xffb37a : 0xf6f3ec;
      g.add(ringLine(found.slot.piece, y, color, 0.9, false));
      for (const [a, b] of cutEdges(found.slot)) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a[0], y + 0.001, a[1]),
          new THREE.Vector3(b[0], y + 0.001, b[1]),
        ]);
        const line = new THREE.Line(
          geo,
          new THREE.LineDashedMaterial({ color, dashSize: 0.012, gapSize: 0.008 }),
        );
        line.computeLineDistances();
        g.add(line);
      }
      this.chalk.add(g);
      this.chalkMarks.set(key, g);
    }
    // Pulse the gaps waiting for a cut piece.
    const pulse = 0.55 + Math.sin(this.time * 5) * 0.4;
    for (const obj of this.chalkMarks.values()) {
      if (obj.userData['kind'] !== 'cut') continue;
      obj.traverse((o) => {
        if (o instanceof THREE.Line) (o.material as THREE.LineBasicMaterial).opacity = pulse;
      });
    }
  }

  // ---- HUD ----------------------------------------------------------------------------------

  private updateHud(dt: number): void {
    const hud = this.hud;
    hud.setStats(this.world.state.laid, this.world.state.area);
    hud.setCarry(this.whole, this.marked.length + (this.split ? 1 : 0), this.cut.length);
    const t = this.target;
    const hot = !!t && t.reach && (t.kind !== 'slot' || this.canFill(t));
    hud.setCrosshair(this.input.locked, hot);
    if (this.hintFlash.t > 0) {
      this.hintFlash.t -= dt;
      hud.hint(this.hintFlash.text);
      return;
    }
    hud.hint(this.hintText());
  }

  private hintText(): string {
    const v = this.verb();
    const t = this.target;
    if (this.carrying) return `${v} to set the splitter down.`;
    if (t?.kind === 'pack') {
      if (!t.reach) return 'Walk up to the pack.';
      return this.whole + this.marked.length + this.cut.length >= CAP
        ? 'Your hands are full.'
        : `${v} to pick up blocks.`;
    }
    if (t?.kind === 'splitter') {
      if (this.split) return '';
      if (this.marked.length)
        return t.reach ? `${v} to cut the marked block.` : 'Walk over to the splitter.';
      return `${v} to move the splitter. ${v} again to set it down.`;
    }
    if (t?.kind === 'slot' && !t.view.placed[t.slot.i]) {
      if (!t.reach) return 'Move a little closer.';
      const key = refKey({ k: t.view.chunk.k, i: t.slot.i });
      if (t.slot.kind === 'edge') {
        if (this.cut.some((r) => refKey(r) === key)) return `${v} to lay the cut piece.`;
        if (this.marked.some((r) => refKey(r) === key)) return 'Marked. Cut it on the splitter.';
        if (this.whole > 0) return `Edge gap: ${v.toLowerCase()} to mark a block for cutting.`;
        return 'Edge gap. Pick up a block to mark for it.';
      }
      if (this.whole > 0)
        return this.everSwept || this.world.state.laid < 6
          ? `${v} to lay a block.`
          : this.input.touch
            ? 'Tip: press and hold, then drag, to lay as you sweep.'
            : 'Tip: hold the button and sweep to keep laying.';
    }
    if (this.cut.length) return 'Lay the cut piece in its marked gap.';
    if (this.marked.length && this.whole === 0) return 'Take the marked blocks to the splitter.';
    if (this.whole + this.marked.length === 0) return `${v} a pack of blocks to pick some up.`;
    if (this.world.state.laid === 0) return `${v} the sand bed to lay a block.`;
    return '';
  }

  // ---- Saving -------------------------------------------------------------------------------

  save(): void {
    this.saveTimer = 0;
    this.dirty = false;
    const sp = this.splitter.root;
    saveSite(
      this.world.state,
      {
        x: this.x,
        z: this.z,
        yaw: this.yaw,
        pitch: this.pitch,
        stand: this.stand,
        // Marked and cut blocks go back to being whole blocks if you leave mid-cut.
        whole: this.whole + this.marked.length + this.cut.length + (this.split ? 1 : 0),
      },
      { x: sp.position.x, z: sp.position.z, yaw: sp.rotation.y },
    );
  }

  // ---- Debug hooks for tests and screenshots ------------------------------------------------

  debugFill(s0: number, s1: number, edges = true): number {
    let n = 0;
    for (const v of this.world.views.values()) {
      for (const slot of v.chunk.slots) {
        if (slot.s < s0 || slot.s >= s1 || v.placed[slot.i]) continue;
        if (slot.kind === 'edge' && !edges) continue;
        this.world.place(v, slot);
        n++;
      }
    }
    return n;
  }

  teleport(s: number, lat: number, yawOffset: number, pitch: number, stand = false): void {
    const [x, z] = this.path.offset(s, lat);
    this.x = x;
    this.z = z;
    this.s = s;
    const p = this.path.at(s);
    // yaw 0 looks along -z; path heading th looks along (cos th, sin th).
    this.yaw = -(p.th + Math.PI / 2) + yawOffset;
    this.pitch = pitch;
    this.stand = stand;
    this.eye = stand ? STAND_EYE : KNEEL_EYE;
    this.world.streamAll(s);
  }

  debugState(): Record<string, unknown> {
    return {
      whole: this.whole,
      marked: this.marked.length,
      cut: this.cut.length,
      laid: this.world.state.laid,
      s: this.s,
      target: this.target ? this.target.kind : null,
      splitting: !!this.split,
    };
  }

  debugAct(sx: number | null, sy: number | null): boolean {
    return this.act(this.pick(sx, sy), false);
  }

  /** Screen position (CSS px) of a world point. */
  debugScreen(x: number, y: number, z: number): [number, number] {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
  }

  /** Nearest unplaced slot of a kind, as [x, z]. */
  debugNearestSlot(kind: 'full' | 'edge'): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const v of this.world.views.values()) {
      for (const slot of v.chunk.slots) {
        if (slot.kind !== kind || v.placed[slot.i]) continue;
        const c = ringCentroid2(slot.piece);
        const d = Math.hypot(c[0] - this.x, c[1] - this.z);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  }

  /** Turn to look at a world point. */
  debugLookAt(x: number, y: number, z: number): void {
    const dx = x - this.x;
    const dz = z - this.z;
    const dy = y - (GROUND_Y + this.eye);
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.updateCamera(0);
  }

  debugCutSlot(): [number, number] | null {
    const found = this.cut[0] ? this.findSlot(this.cut[0]) : null;
    return found ? ringCentroid2(found.slot.piece) : null;
  }

  debugSplitter(): [number, number, number] {
    const p = this.splitter.root.position;
    return [p.x, p.y + 0.45, p.z];
  }

  debugPack(): [number, number, number] {
    const v = this.world.views.get(0)!;
    return [v.pack.x, GROUND_Y + 0.5, v.pack.z];
  }

  debugMove(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.s = this.path.nearest(x, z, -10, 4000).s;
    this.updateCamera(0);
  }
}

function ringAreaSigned(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function ringLine(
  ring: Ring,
  y: number,
  color: number,
  opacity: number,
  dashed: boolean,
): THREE.Line {
  const pts = ring.map((p) => new THREE.Vector3(p[0], y, p[1]));
  pts.push(pts[0]!.clone());
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed
    ? new THREE.LineDashedMaterial({
        color,
        dashSize: 0.01,
        gapSize: 0.01,
        transparent: true,
        opacity,
      })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  if (dashed) line.computeLineDistances();
  return line;
}
