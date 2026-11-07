/**
 * The cartoon look: cel shading and ink outlines.
 *
 * - `toon()` makes a material with three flat bands of light instead of a
 *   smooth gradient, like a hand-coloured comic.
 * - `outline()` gives a mesh a dark ink edge using the "inverted hull" trick:
 *   a slightly fattened copy drawn inside-out in solid ink. The fattening is
 *   done in the shader relative to the camera, so the line stays the same
 *   thickness on screen near and far.
 * - `bake()` merges a segment's static scenery into a handful of meshes, so
 *   outlines don't double the work for the phone.
 *
 * Players can turn the outlines off in Settings ("Ink outlines").
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const INK = '#1f2a44';

// ---------------------------------------------------------------------------
// Cel shading
// ---------------------------------------------------------------------------

const gradientMap = (() => {
  const tones = new Uint8Array([110, 190, 255]);
  const texture = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
})();

export interface ToonOptions {
  map?: THREE.Texture;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

export function toon(color: string, options: ToonOptions = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap,
    map: options.map ?? null,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissiveIntensity ?? 1,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

// ---------------------------------------------------------------------------
// Ink outlines
// ---------------------------------------------------------------------------

/** Line thickness, as a fraction of the distance to the camera. */
const THICKNESS = 0.0045;

const outlineMaterial = (() => {
  const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = { value: THICKNESS };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uThickness;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        `
        vec4 mvPosition = vec4( transformed, 1.0 );
        mat3 toView = mat3( modelViewMatrix );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          toView = toView * mat3( instanceMatrix );
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        vec3 viewNormal = normalize( toView * normal );
        mvPosition.xyz += viewNormal * uThickness * clamp( -mvPosition.z, 1.0, 60.0 );
        gl_Position = projectionMatrix * mvPosition;
        `,
      );
  };
  return material;
})();

/** Smooth-normal copies of geometry for outlines, shared per source geometry. */
const hullCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

function hullOf(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let hull = hullCache.get(geometry);
  if (!hull) {
    // Welding the corners and averaging the normals keeps the outline in one
    // piece around sharp edges instead of splitting open at each corner.
    const positionOnly = new THREE.BufferGeometry();
    positionOnly.setAttribute('position', geometry.getAttribute('position'));
    if (geometry.index) positionOnly.setIndex(geometry.index);
    hull = mergeVertices(positionOnly, 1e-4);
    hull.computeVertexNormals();
    hullCache.set(geometry, hull);
  }
  return hull;
}

/** Show or hide every outline at once (they all share one material). */
export function setOutlines(on: boolean): void {
  outlineMaterial.visible = on;
}

function wantsOutline(mesh: THREE.Mesh): boolean {
  if (mesh.userData.noOutline || mesh.userData.isOutline) return false;
  const material = mesh.material as THREE.Material;
  return !material.transparent && !(material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
}

/** Add ink outlines to every suitable mesh under `root`. */
export function outline(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && wantsOutline(mesh)) meshes.push(mesh);
  });
  for (const mesh of meshes) {
    const hull = hullOf(mesh.geometry);
    let ink: THREE.Mesh;
    const inst = mesh as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      const copy = new THREE.InstancedMesh(hull, outlineMaterial, inst.count);
      copy.instanceMatrix = inst.instanceMatrix;
      copy.userData.unique = true;
      ink = copy;
    } else {
      ink = new THREE.Mesh(hull, outlineMaterial);
    }
    ink.userData.isOutline = true;
    ink.castShadow = false;
    ink.receiveShadow = false;
    mesh.add(ink);
  }
}

// ---------------------------------------------------------------------------
// Baking static scenery
// ---------------------------------------------------------------------------

function asMergeable(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, withUv: boolean): THREE.BufferGeometry {
  const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone()) as THREE.BufferGeometry;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(withUv && name === 'uv')) g.deleteAttribute(name);
  }
  if (withUv && !g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  return g;
}

/**
 * Merge the plain meshes directly inside `group` (not obstacles, coins or
 * anything else that moves or disappears) into one mesh per material, plus a
 * single mesh for all their outlines.
 */
export function bake(group: THREE.Group): void {
  const buckets = new Map<string, { material: THREE.Material; shadow: boolean; parts: THREE.BufferGeometry[] }>();
  const hulls: THREE.BufferGeometry[] = [];
  const baked: THREE.Mesh[] = [];

  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.userData.keep || mesh.children.length) continue;
    mesh.updateMatrix();
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}|${mesh.castShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material, shadow: mesh.castShadow, parts: [] };
      buckets.set(key, bucket);
    }
    bucket.parts.push(asMergeable(mesh.geometry, mesh.matrix, true));
    if (wantsOutline(mesh)) hulls.push(asMergeable(hullOf(mesh.geometry), mesh.matrix, false));
    if (mesh.userData.unique) mesh.geometry.dispose();
    baked.push(mesh);
  }

  for (const mesh of baked) group.remove(mesh);
  for (const { material, shadow, parts } of buckets.values()) {
    const merged = new THREE.Mesh(mergeGeometries(parts), material);
    for (const p of parts) p.dispose();
    merged.castShadow = shadow;
    merged.receiveShadow = true;
    merged.userData.unique = true;
    merged.userData.noOutline = true;
    group.add(merged);
  }
  if (hulls.length) {
    const ink = new THREE.Mesh(mergeGeometries(hulls), outlineMaterial);
    for (const h of hulls) h.dispose();
    ink.userData.unique = true;
    ink.userData.isOutline = true;
    group.add(ink);
  }
}
