/**
 * First-person gloved hands, built from capsules: orange knit gloves with a green dipped coating
 * on the palm and fingertips, over bare forearms. Each hand is one merged mesh with vertex
 * colours, posed in a loose grip.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SurfaceTex } from './textures';

const ORANGE = new THREE.Color().setRGB(1.0, 0.36, 0.08, THREE.SRGBColorSpace);
const COATING = new THREE.Color().setRGB(0.12, 0.52, 0.47, THREE.SRGBColorSpace);
const SKIN = new THREE.Color().setRGB(0.83, 0.62, 0.5, THREE.SRGBColorSpace);

type Paint = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

function painted(geo: THREE.BufferGeometry, paintFn: Paint): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const c = paintFn(p, n);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Capsule from a to b. */
function segment(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/**
 * Hand space: wrist at the origin, fingers towards -z, palm facing -y. With the palm down the
 * thumb points towards +x on a left hand (side = 1) and -x on a right hand (side = -1).
 */
export function handGeometry(
  side: 1 | -1,
  grip = 0.5,
  bend = -0.5,
): { glove: THREE.BufferGeometry; arm: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  // Palm side is coated; so is everything past the middle knuckle.
  const glove: Paint = (_p, n) => (n.y < -0.25 ? COATING : ORANGE);
  const tip: Paint = () => COATING;

  // Palm.
  const palm = new THREE.CapsuleGeometry(0.03, 0.045, 4, 12);
  palm.rotateX(Math.PI / 2);
  palm.scale(1.35, 0.55, 1);
  palm.translate(0, 0, -0.055);
  parts.push(painted(palm, glove));

  // Fingers: index next to the thumb.
  const lengths = [0.08, 0.088, 0.083, 0.068];
  const offsets = [0.028, 0.009, -0.01, -0.028];
  const curl = [0.12 + grip * 0.6, 0.22 + grip * 0.7, 0.15 + grip * 0.5];
  for (let f = 0; f < 4; f++) {
    const len = lengths[f]!;
    const segs = [len * 0.45, len * 0.3, len * 0.25];
    let p = new THREE.Vector3(offsets[f]! * side, 0.002, -0.1 + Math.abs(offsets[f]!) * 0.35);
    let dir = new THREE.Vector3(offsets[f]! * side * 1.6, 0, -1).normalize();
    const r = f === 3 ? 0.0085 : 0.0095;
    for (let k = 0; k < 3; k++) {
      dir = dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), -curl[k]! * (f === 3 ? 1.15 : 1));
      const q = p.clone().addScaledVector(dir, segs[k]!);
      const g = segment(p, q, r);
      parts.push(painted(g, k === 2 ? tip : glove));
      p = q;
    }
  }

  // Thumb.
  {
    let p = new THREE.Vector3(0.032 * side, -0.01, -0.035);
    let dir = new THREE.Vector3(0.7 * side, -0.35, -0.65).normalize();
    const segs = [0.04, 0.032, 0.026];
    for (let k = 0; k < 3; k++) {
      const q = p.clone().addScaledVector(dir, segs[k]!);
      parts.push(painted(segment(p, q, k === 0 ? 0.014 : 0.0105), k === 2 ? tip : glove));
      p = q;
      dir = dir
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35 * side)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.25 - grip * 0.3);
    }
  }

  // Flex the wrist: the hand tips towards the palm, the cuff and forearm stay put.
  for (const g of parts) g.rotateX(bend);

  // Knit cuff and forearm.
  const cuff = new THREE.CylinderGeometry(0.031, 0.034, 0.06, 16, 1, true);
  cuff.rotateX(Math.PI / 2);
  cuff.scale(1.2, 0.8, 1);
  cuff.translate(0, 0, 0.025);
  parts.push(painted(cuff, () => ORANGE));
  const arm = new THREE.CapsuleGeometry(0.029, 0.36, 4, 14);
  arm.rotateX(Math.PI / 2);
  arm.scale(1.15, 0.85, 1);
  arm.translate(0, 0, 0.235);

  for (const g of parts) {
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    }
  }
  return { glove: mergeGeometries(parts)!, arm };
}

export function skinMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6, metalness: 0 });
}

export function gloveMaterial(knit: SurfaceTex): THREE.MeshStandardMaterial {
  const map = knit.map.clone();
  map.repeat.set(3, 3);
  map.needsUpdate = true;
  const normalMap = knit.normalMap.clone();
  normalMap.repeat.set(3, 3);
  normalMap.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
  });
}
