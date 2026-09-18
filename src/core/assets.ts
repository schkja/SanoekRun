/**
 * Asset loading.
 *
 * The important behaviour here: if a .glb model is missing or fails to load,
 * the game does NOT crash. It logs a warning and returns a coloured placeholder
 * shape instead. That means you can build a whole level with placeholders and
 * swap in real models one at a time, whenever you like.
 *
 * To add a model: drop `thing.glb` into `public/models/` and reference it as
 * `"model": "thing.glb"` in any content JSON file.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type PlaceholderShape = 'sphere' | 'box' | 'gem' | 'ring';

const MODEL_PATH = 'models/';

export class Assets {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<THREE.Object3D | null>>();
  private readonly failed = new Set<string>();

  /**
   * Load a model by file name. Resolves to null (never throws) when the file
   * is missing, so callers can fall back to a placeholder shape.
   */
  async model(file: string | undefined): Promise<THREE.Object3D | null> {
    if (!file) return null;
    if (this.failed.has(file)) return null;

    let entry = this.cache.get(file);
    if (!entry) {
      entry = this.loader
        .loadAsync(MODEL_PATH + file)
        .then((gltf) => {
          const root = gltf.scene;
          root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          return root as THREE.Object3D;
        })
        .catch(() => {
          this.failed.add(file);
          console.warn(
            `[assets] Could not load "${MODEL_PATH}${file}". Using a placeholder shape instead.`,
          );
          return null;
        });
      this.cache.set(file, entry);
    }

    const source = await entry;
    // Clone so several entities can share one loaded file.
    return source ? source.clone(true) : null;
  }

  /**
   * Get a model if it exists, otherwise a placeholder of the given shape/colour.
   * This is what every entity calls — it always returns something drawable.
   */
  async modelOrShape(
    file: string | undefined,
    shape: PlaceholderShape,
    color: string,
    size: number | [number, number, number] = 1,
  ): Promise<THREE.Object3D> {
    const loaded = await this.model(file);
    if (loaded) {
      if (typeof size === 'number' && size !== 1) loaded.scale.multiplyScalar(size);
      return loaded;
    }
    return makePlaceholder(shape, color, size);
  }
}

/** Build a simple lit mesh. Used everywhere a model is missing. */
export function makePlaceholder(
  shape: PlaceholderShape,
  color: string,
  size: number | [number, number, number] = 1,
): THREE.Mesh {
  const [sx, sy, sz] = typeof size === 'number' ? [size, size, size] : size;

  let geometry: THREE.BufferGeometry;
  switch (shape) {
    case 'sphere':
      geometry = new THREE.SphereGeometry(0.5, 20, 14);
      break;
    case 'gem':
      geometry = new THREE.OctahedronGeometry(0.5, 0);
      break;
    case 'ring':
      geometry = new THREE.TorusGeometry(0.4, 0.14, 12, 24);
      break;
    case 'box':
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
      break;
  }

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.45,
    metalness: 0.1,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.15,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Free GPU memory for a subtree. Called when a level is torn down. */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
