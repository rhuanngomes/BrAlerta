import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const BUILDINGS = 'ABCDEFGH'.split('').map(c => `building_${c}_withoutBase`);
const NAMES = [...BUILDINGS, 'car_sedan', 'car_hatchback', 'car_taxi', 'car_stationwagon', 'streetlight', 'bench', 'trafficlight_A', 'firehydrant', 'bush'];
type Part = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };

/** Bake source transforms and normalize every asset to a centred, grounded, metre-compatible model. */
export class CityAssets {
  private models = new Map<string, Part[]>();
  private sizes = new Map<string, THREE.Vector3>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private sourceMaterials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private disposed = false;

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(NAMES.map(async name => {
      try {
        const gltf = await loader.loadAsync(`/models/city/${name}.gltf`);
        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const parts: Part[] = [];
        gltf.scene.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
          geometry.translate(-center.x, -bounds.min.y, -center.z);
          child.geometry.dispose();
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
            this.sourceMaterials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) this.textures.add(value);
          }
          parts.push({ geometry, material: child.material });
        });
        // These CC0 models use one atlas. Merge matching parts so moving cars take one draw each.
        if (parts.length > 1 && parts.every(part => !Array.isArray(part.material) && part.material === parts[0].material)) {
          const merged = mergeGeometries(parts.map(part => part.geometry), false);
          if (merged) {
            parts.forEach(part => part.geometry.dispose());
            this.models.set(name, [{ geometry: merged, material: parts[0].material }]);
          } else this.models.set(name, parts);
        } else this.models.set(name, parts);
        this.sizes.set(name, size);
      } catch (error) {
        console.warn(`Modelo urbano indisponível: ${name}`, error);
      }
    }));
    if (this.disposed) this.dispose();
  }

  size(name: string): THREE.Vector3 { return this.sizes.get(name) ?? new THREE.Vector3(1, 1, 1); }
  parts(name: string): Part[] { return this.models.get(name) ?? []; }
  material(color: string): THREE.MeshStandardMaterial {
    let material = this.materials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.78, flatShading: true });
      this.materials.set(color, material);
    }
    return material;
  }
  geometry(kind: string): THREE.BufferGeometry {
    let geometry = this.geometries.get(kind);
    if (!geometry) {
      geometry = kind === 'leaf' ? new THREE.IcosahedronGeometry(1, 0)
        : kind === 'cone' ? new THREE.ConeGeometry(0.5, 1, 8)
        : kind === 'cylinder' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 8)
        : kind === 'sphere' ? new THREE.SphereGeometry(0.5, 10, 8)
        : kind === 'ring' ? new THREE.TorusGeometry(1, 0.035, 4, 32).rotateX(Math.PI / 2)
        : new THREE.BoxGeometry(1, 1, 1);
      this.geometries.set(kind, geometry);
    }
    return geometry;
  }
  mesh(parent: THREE.Object3D, kind: string, color: string, position: number[], scale: number[], rotation = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(kind), this.material(color));
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.rotation.y = rotation;
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  model(name: string, width: number): THREE.Group {
    const group = new THREE.Group();
    const scale = width / this.size(name).x;
    for (const part of this.parts(name)) {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.scale.setScalar(scale);
    return group;
  }
  dispose(): void {
    this.disposed = true;
    for (const parts of this.models.values()) for (const part of parts) part.geometry.dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of [...this.materials.values(), ...this.sourceMaterials]) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.models.clear(); this.geometries.clear(); this.materials.clear(); this.sourceMaterials.clear(); this.textures.clear();
  }
}

/** Static street furniture and architecture share instanced draws instead of thousands of meshes. */
export class CityBatch {
  private entries = new Map<string, { parts: Part[]; matrices: THREE.Matrix4[] }>();
  private dummy = new THREE.Object3D();
  constructor(private assets: CityAssets) {}
  private add(key: string, parts: Part[], x: number, y: number, z: number, sx: number, sy: number, sz: number, angle: number) {
    this.dummy.position.set(x, y, z); this.dummy.rotation.set(0, angle, 0); this.dummy.scale.set(sx, sy, sz); this.dummy.updateMatrix();
    let entry = this.entries.get(key);
    if (!entry) { entry = { parts, matrices: [] }; this.entries.set(key, entry); }
    entry.matrices.push(this.dummy.matrix.clone());
  }
  box(color: string, x: number, y: number, z: number, w: number, h: number, d: number, angle = 0, kind = 'box') {
    this.add(`${color}:${kind}`, [{ geometry: this.assets.geometry(kind), material: this.assets.material(color) }], x, y, z, w, h, d, angle);
  }
  model(name: string, x: number, y: number, z: number, width: number, angle = 0, depth?: number) {
    const size = this.assets.size(name), s = width / size.x;
    this.add(name, this.assets.parts(name), x, y, z, s, name.startsWith('building_') ? Math.min(s, 7.5) : s, depth ? depth / size.z : s, angle);
  }
  tree(x: number, z: number, seed: number) {
    const h = 6 + seed % 3;
    this.box('#a9b4ac', x, .22, z, 2.6, .4, 2.6);
    this.box('#4f6945', x, .45, z, 2.25, .12, 2.25);
    this.box('#79543b', x, h / 2, z, .45, h, .45, 0, 'cylinder');
    const green = ['#449d3d', '#78b832', '#309251', '#92bc37'][seed % 4];
    for (const [dx, dy, dz, r] of [[0, 0, 0, 3.1], [-1.8, -.8, .5, 2.1], [1.5, -.5, .6, 2.4], [.2, -.6, -1.7, 2.1]]) {
      this.box(green, x + dx, h + dy, z + dz, r, r * .9, r, seed, 'leaf');
    }
  }
  finish(): THREE.Group {
    const group = new THREE.Group();
    for (const { parts, matrices } of this.entries.values()) for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); group.add(mesh);
    }
    return group;
  }
}

export function disposeInstances(group: THREE.Object3D): void {
  group.traverse(child => { if (child instanceof THREE.InstancedMesh) child.dispose(); });
  group.removeFromParent(); group.clear();
}
