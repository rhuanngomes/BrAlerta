import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MercatorCoordinate } from 'maplibre-gl';
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  LngLatLike,
  Map as MapInstance,
} from 'maplibre-gl';
import type { Incident, IncidentCategory } from '../../types';

type SceneObject = {
  incident: Incident;
  group: THREE.Group;
  fallback: THREE.Group;
};

const MODEL_ZOOM_THRESHOLD = 15.5;
const SCENE_VISUAL_SCALE = 6;
const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const categoryModelPaths: Record<IncidentCategory, string> = {
  STREETLIGHT: publicAsset('modelos/poste-apagado.glb'),
  POTHOLE: publicAsset('modelos/buraco.glb'),
  FLOOD: publicAsset('models/FLOOD.glb'),
  SAFETY: publicAsset('models/SAFETY.glb'),
};

export class ThreeSceneLayer implements CustomLayerInterface {
  readonly id = 'three-scene';
  readonly type = 'custom';
  readonly renderingMode = '3d';

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly raycaster = new THREE.Raycaster();
  private readonly objects = new Map<string, SceneObject>();
  private readonly modelCache = new Map<IncidentCategory, Promise<GLTF | null>>();
  private readonly modelUsers = new Map<IncidentCategory, number>();
  private readonly sharedGeometries = new Map<string, THREE.BufferGeometry>();
  private readonly sharedMaterials = new Map<string, THREE.Material>();
  private map: MapInstance | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private preview: { category: IncidentCategory; group: THREE.Group } | null = null;
  private stripeTexture: THREE.CanvasTexture | null = null;
  private zoom = 0;
  private lastAnimationTime = 0;

  constructor() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const sunlight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunlight.position.set(1, -1, 2);
    this.scene.add(sunlight);
    this.camera.matrixAutoUpdate = false;
  }

  onAdd(map: MapInstance, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
  }

  render(_gl: WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    if (!this.renderer) return;

    this.camera.projectionMatrix.fromArray(input.defaultProjectionData.mainMatrix);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.matrixWorld.identity();
    this.camera.matrixWorldInverse.identity();
    this.camera.matrixWorldNeedsUpdate = false;

    const now = performance.now() / 1000;
    const hasVisibleAnimation = [...this.objects.values()].some(({ group }) => {
      if (!group.visible) return false;
      group.traverse((child) => {
        const animation = child.userData.animation;
        if (animation === 'flood-car') {
          child.position.y = (child.userData.baseY ?? 0) + Math.sin(now * 2.2) * 0.025;
          child.rotation.z = 0.04 + Math.sin(now * 1.3) * 0.018;
        } else if (animation === 'streetlight') {
          child.rotation.z = 0.08 + Math.sin(now * 1.8) * 0.025;
        }
      });
      return group.userData.hasAnimation === true;
    });
    this.scene.updateMatrixWorld(true);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();
    if (hasVisibleAnimation && now - this.lastAnimationTime >= 1 / 30) {
      this.lastAnimationTime = now;
      this.map?.triggerRepaint();
    }
  }

  onRemove(): void {
    this.clearPreview();
    for (const { incident, group, fallback } of this.objects.values()) {
      this.scene.remove(group);
      this.disposeObject(fallback);
      for (const child of group.children) {
        if (child !== fallback) this.disposeObject(child);
      }
      this.releaseModel(incident.category);
    }
    this.objects.clear();
    this.scene.clear();
    for (const geometry of this.sharedGeometries.values()) geometry.dispose();
    this.sharedGeometries.clear();
    for (const material of this.sharedMaterials.values()) material.dispose();
    this.sharedMaterials.clear();
    this.stripeTexture?.dispose();
    this.stripeTexture = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  setIncidents(incidents: Incident[]): void {
    const incoming = new Map(incidents.map((incident) => [incident.id, incident]));

    for (const [id, current] of this.objects) {
      const next = incoming.get(id);
      if (!next || next.category !== current.incident.category) {
        this.scene.remove(current.group);
        this.disposeObject(current.fallback);
        for (const child of current.group.children) {
          if (child !== current.fallback) this.disposeObject(child);
        }
        this.releaseModel(current.incident.category);
        this.objects.delete(id);
      }
    }

    for (const incident of incidents) {
      const current = this.objects.get(incident.id);
      if (current) {
        if (
          current.incident.latitude !== incident.latitude
          || current.incident.longitude !== incident.longitude
        ) {
          this.positionAt(current.group, [incident.longitude, incident.latitude]);
        }
        current.incident = incident;
        continue;
      }

      const group = new THREE.Group();
      group.userData.incidentId = incident.id;
      group.userData.category = incident.category;
      group.userData.hasAnimation = incident.category === 'FLOOD'
        || incident.category === 'STREETLIGHT';
      group.visible = this.zoom >= MODEL_ZOOM_THRESHOLD;
      this.positionAt(group, [incident.longitude, incident.latitude]);
      const fallback = this.createProceduralObject(incident.category, false);
      group.add(fallback);
      this.scene.add(group);
      this.objects.set(incident.id, { incident, group, fallback });
      this.modelUsers.set(
        incident.category,
        (this.modelUsers.get(incident.category) ?? 0) + 1,
      );
      void this.replaceFallbackWithModel(incident.category, group, fallback);
    }
    this.map?.triggerRepaint();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    const visible = zoom >= MODEL_ZOOM_THRESHOLD;
    for (const { group } of this.objects.values()) group.visible = visible;
    if (!visible) this.clearPreview();
    else if (this.preview) this.preview.group.visible = true;
    this.map?.triggerRepaint();
  }

  setPreview(category: IncidentCategory | null, coordinates: LngLatLike | null): void {
    if (!category || !coordinates) {
      this.clearPreview();
      return;
    }

    this.clearPreview();
    const group = new THREE.Group();
    this.positionAt(group, coordinates);
    group.add(this.createProceduralObject(category, true));
    this.scene.add(group);
    group.visible = this.zoom >= MODEL_ZOOM_THRESHOLD;
    this.preview = { category, group };
    this.map?.triggerRepaint();
  }

  hitTest(point: { x: number; y: number }, width: number, height: number): string | null {
    if (width <= 0 || height <= 0 || this.objects.size === 0) return null;

    const normalized = new THREE.Vector2(
      (point.x / width) * 2 - 1,
      1 - (point.y / height) * 2,
    );
    this.raycaster.setFromCamera(normalized, this.camera);
    const intersections = this.raycaster.intersectObjects(
      [...this.objects.values()]
        .map(({ group }) => group)
        .filter((group) => group.visible),
      true,
    );

    for (const intersection of intersections) {
      let object: THREE.Object3D | null = intersection.object;
      while (object) {
        const incidentId = object.userData.incidentId;
        if (typeof incidentId === 'string') return incidentId;
        object = object.parent;
      }
    }
    return null;
  }

  private async replaceFallbackWithModel(
    category: IncidentCategory,
    group: THREE.Group,
    fallback: THREE.Group,
  ): Promise<void> {
    const gltf = await this.loadModel(category);
    if (!gltf || !this.objects.has(group.userData.incidentId)) return;

    const current = this.objects.get(group.userData.incidentId);
    if (current?.group !== group || current.fallback !== fallback) return;

    group.remove(fallback);
    this.disposeObject(fallback);
    const model = gltf.scene.clone(true);
    model.traverse((child) => {
      child.userData.sharedModelResources = true;
    });
    group.add(model);
    this.map?.triggerRepaint();
  }

  private loadModel(category: IncidentCategory): Promise<GLTF | null> {
    const cached = this.modelCache.get(category);
    if (cached) return cached;

    const loader = new GLTFLoader();
    const model = new Promise<GLTF | null>((resolve) => {
      loader.load(
        categoryModelPaths[category],
        resolve,
        undefined,
        (error) => {
          console.info(`Usando malha procedural para ${category}:`, error);
          resolve(null);
        },
      );
    });
    this.modelCache.set(category, model);
    return model;
  }

  private releaseModel(category: IncidentCategory): void {
    const remaining = (this.modelUsers.get(category) ?? 1) - 1;
    if (remaining > 0) {
      this.modelUsers.set(category, remaining);
      return;
    }

    this.modelUsers.delete(category);
    const model = this.modelCache.get(category);
    this.modelCache.delete(category);
    if (model) {
      void model.then((gltf) => {
        if (gltf) this.disposeObject(gltf.scene);
      });
    }
  }

  private positionAt(group: THREE.Group, coordinates: LngLatLike): void {
    const mercator = MercatorCoordinate.fromLngLat(coordinates);
    const scale = mercator.meterInMercatorCoordinateUnits();
    group.matrixAutoUpdate = false;
    group.matrix
      .makeTranslation(mercator.x, mercator.y, mercator.z)
      .scale(new THREE.Vector3(
        scale * SCENE_VISUAL_SCALE,
        -scale * SCENE_VISUAL_SCALE,
        scale * SCENE_VISUAL_SCALE,
      ))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    group.matrixWorldNeedsUpdate = true;
  }

  private createProceduralObject(category: IncidentCategory, ghost: boolean): THREE.Group {
    const group = new THREE.Group();

    if (category === 'STREETLIGHT') {
      this.addMesh(group, 'pole-base', () => new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8), 'metal', 0x414b51, [0, 0.08, 0], ghost);
      this.addMesh(group, 'streetlight-pole', () => new THREE.CylinderGeometry(0.075, 0.12, 3.05, 8), 'metal', 0x414b51, [0, 1.65, 0], ghost);
      const fixture = new THREE.Group();
      fixture.position.set(0, 3.05, 0);
      fixture.userData.animation = 'streetlight';
      this.addMesh(fixture, 'streetlight-arm', () => new THREE.CylinderGeometry(0.045, 0.045, 0.9, 7), 'metal', 0x414b51, [0.38, 0, 0], ghost, new THREE.Euler(0, 0, Math.PI / 2));
      this.addMesh(fixture, 'lamp-housing', () => new THREE.BoxGeometry(0.42, 0.17, 0.28), 'lamp-housing', 0x303a40, [0.82, -0.08, 0], ghost, new THREE.Euler(0, 0, -0.16));
      this.addMesh(fixture, 'lamp-off', () => new THREE.BoxGeometry(0.29, 0.045, 0.2), 'lamp-off', 0x20292d, [0.82, -0.19, 0], ghost);
      this.addMesh(fixture, 'spark', () => new THREE.OctahedronGeometry(0.055, 0), 'warning', 0xf3b24d, [1.12, 0.18, 0.04], ghost);
      this.addMesh(fixture, 'spark', () => new THREE.OctahedronGeometry(0.04, 0), 'warning', 0xf3b24d, [0.65, 0.2, 0.05], ghost);
      group.add(fixture);
    } else if (category === 'FLOOD') {
      this.addMesh(group, 'water', () => new THREE.CylinderGeometry(2.15, 2.15, 0.055, 24), 'water', 0x22b9c9, [0, 0.025, 0], ghost, undefined, undefined, undefined, { opacity: 0.72, roughness: 0.15 });
      this.addMesh(group, 'water-ripple', () => new THREE.TorusGeometry(2.08, 0.07, 5, 24), 'ripple', 0x8cecf0, [0, 0.075, 0], ghost, new THREE.Euler(-Math.PI / 2, 0, 0), undefined, undefined, { opacity: 0.8, roughness: 0.15 });
      const car = new THREE.Group();
      car.position.set(0.05, -0.2, 0);
      car.rotation.set(0.05, 0, 0.04);
      car.userData.baseY = -0.2;
      car.userData.animation = 'flood-car';
      this.addMesh(car, 'car-body', () => new THREE.BoxGeometry(2.05, 0.43, 0.92), 'car-body', 0xe59a42, [0, 0.43, 0], ghost, new THREE.Euler(0, 0, 0.055));
      this.addMesh(car, 'car-cabin', () => new THREE.BoxGeometry(1.08, 0.43, 0.76), 'car-glass', 0x344c58, [-0.08, 0.83, 0], ghost, new THREE.Euler(0, 0, -0.04));
      this.addMesh(car, 'car-window', () => new THREE.BoxGeometry(0.83, 0.22, 0.78), 'car-window', 0x172b37, [-0.08, 0.84, 0], ghost);
      for (const x of [-0.65, 0.65]) {
        for (const z of [-0.48, 0.48]) {
          this.addMesh(car, 'car-wheel', () => new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8), 'rubber', 0x202528, [x, 0.16, z], ghost, new THREE.Euler(Math.PI / 2, 0, 0));
        }
      }
      group.add(car);
      group.userData.hasAnimation = true;
    } else if (category === 'POTHOLE') {
      this.addMesh(group, 'crater', () => new THREE.CylinderGeometry(0.74, 0.68, 0.09, 10), 'crater', 0x252a29, [0, 0.035, 0], ghost);
      this.addMesh(group, 'crater-rim', () => new THREE.TorusGeometry(0.75, 0.14, 5, 12), 'asphalt-rim', 0x665b4c, [0, 0.07, 0], ghost, new THREE.Euler(-Math.PI / 2, 0, 0));
      const fallenCone = new THREE.Group();
      fallenCone.position.set(1.05, 0.22, 0.45);
      fallenCone.rotation.z = Math.PI / 2;
      this.addMesh(fallenCone, 'fallen-cone', () => new THREE.ConeGeometry(0.23, 0.58, 6), 'cone', 0xee722f, [0, 0.34, 0], ghost);
      this.addMesh(fallenCone, 'cone-band', () => new THREE.CylinderGeometry(0.18, 0.18, 0.1, 6), 'cone-band', 0xf4eee1, [0, 0.39, 0], ghost);
      group.add(fallenCone);
      const person = this.createPerson('startled', ghost);
      person.position.set(-1.05, 0, 0.82);
      group.add(person);
    } else {
      const person = this.createPerson('sneaking', ghost);
      group.add(person);
    }

    return group;
  }

  private createPerson(style: 'startled' | 'sneaking', ghost: boolean): THREE.Group {
    const person = new THREE.Group();
    const shirtColor = style === 'startled' ? 0x3c8a9b : 0xffffff;
    const shirtMaterial = style === 'sneaking'
      ? this.stripedShirtMaterial()
      : this.getMaterial('toy-shirt', shirtColor, { roughness: 0.8 });
    const skin = this.getMaterial('toy-skin', 0xe9b495, { roughness: 0.85 });
    const pants = this.getMaterial('toy-pants', style === 'startled' ? 0x44566b : 0x292c33, { roughness: 0.9 });
    const shoes = this.getMaterial('toy-shoes', 0x302b29, { roughness: 0.9 });
    const black = this.getMaterial('toy-black', 0x171b20, { roughness: 0.8 });

    this.addMesh(person, 'toy-torso', () => new THREE.CylinderGeometry(0.18, 0.23, 0.58, 7), 'toy-shirt', shirtColor, [0, 0.91, 0], ghost, undefined, undefined, shirtMaterial);
    this.addMesh(person, 'toy-head', () => new THREE.SphereGeometry(0.2, 9, 7), 'toy-skin', 0xe9b495, [0, 1.39, 0], ghost, undefined, undefined, skin);
    this.addMesh(person, 'toy-left-leg', () => new THREE.CylinderGeometry(0.065, 0.075, 0.58, 6), 'toy-pants', 0x44566b, [-0.105, 0.3, 0], ghost, new THREE.Euler(0, 0, style === 'sneaking' ? 0.55 : -0.08), undefined, pants);
    this.addMesh(person, 'toy-right-leg', () => new THREE.CylinderGeometry(0.065, 0.075, 0.58, 6), 'toy-pants', 0x44566b, [0.12, 0.3, 0], ghost, new THREE.Euler(0, 0, style === 'sneaking' ? -0.5 : 0.08), undefined, pants);
    this.addMesh(person, 'toy-left-shoe', () => new THREE.BoxGeometry(0.2, 0.1, 0.27), 'toy-shoes', 0x302b29, [-0.13, 0.05, -0.06], ghost, undefined, undefined, shoes);
    this.addMesh(person, 'toy-right-shoe', () => new THREE.BoxGeometry(0.2, 0.1, 0.27), 'toy-shoes', 0x302b29, [0.15, 0.05, -0.06], ghost, undefined, undefined, shoes);

    if (style === 'startled') {
      this.addSegment(person, [-0.19, 1.1, 0], [-0.4, 1.42, 0], 'toy-skin', 0xe9b495, skin, ghost);
      this.addSegment(person, [-0.4, 1.42, 0], [-0.43, 1.7, 0], 'toy-skin', 0xe9b495, skin, ghost);
      this.addSegment(person, [0.19, 1.1, 0], [0.4, 1.42, 0], 'toy-skin', 0xe9b495, skin, ghost);
      this.addSegment(person, [0.4, 1.42, 0], [0.43, 1.7, 0], 'toy-skin', 0xe9b495, skin, ghost);
      for (const x of [-0.075, 0.075]) {
        this.addMesh(person, 'frightened-eye', () => new THREE.SphereGeometry(0.028, 6, 5), 'toy-face', 0x24272b, [x, 1.42, -0.18], ghost);
      }
      this.addMesh(person, 'frightened-mouth', () => new THREE.SphereGeometry(0.045, 6, 5), 'toy-face', 0x442d2c, [0, 1.31, -0.19], ghost);
    } else {
      this.addSegment(person, [-0.18, 1.1, 0], [-0.43, 0.93, -0.02], 'toy-skin', 0xe9b495, skin, ghost);
      this.addSegment(person, [-0.43, 0.93, -0.02], [-0.56, 1.12, 0], 'toy-skin', 0xe9b495, skin, ghost);
      this.addSegment(person, [0.18, 1.1, 0], [0.42, 1.25, 0], 'toy-skin', 0xe9b495, skin, ghost);
      this.addSegment(person, [0.42, 1.25, 0], [0.54, 1.42, 0], 'toy-skin', 0xe9b495, skin, ghost);
      this.addMesh(person, 'bandit-cap', () => new THREE.SphereGeometry(0.205, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 'toy-black', 0x171b20, [0, 1.51, 0], ghost, undefined, undefined, black);
      this.addMesh(person, 'bandit-mask', () => new THREE.BoxGeometry(0.37, 0.12, 0.045), 'toy-black', 0x171b20, [0, 1.39, -0.18], ghost, undefined, undefined, black);
      this.addMesh(person, 'bandit-backpack', () => new THREE.BoxGeometry(0.36, 0.42, 0.2), 'toy-black', 0x42413d, [0, 0.98, 0.27], ghost);
    }
    return person;
  }

  private addSegment(
    parent: THREE.Group,
    start: [number, number, number],
    end: [number, number, number],
    materialKey: string,
    color: number,
    material: THREE.Material,
    ghost: boolean,
  ): void {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const segment = this.addMesh(
      parent,
      'toy-limb',
      () => new THREE.CylinderGeometry(0.055, 0.065, 1, 6),
      materialKey,
      color,
      a.add(b).multiplyScalar(0.5).toArray(),
      ghost,
      undefined,
      [0.8, direction.length(), 0.8],
      material,
    );
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }

  private addMesh(
    parent: THREE.Group,
    geometryKey: string,
    makeGeometry: () => THREE.BufferGeometry,
    materialKey: string,
    color: number,
    position: [number, number, number],
    ghost: boolean,
    rotation?: THREE.Euler,
    scale?: [number, number, number],
    materialOverride?: THREE.Material,
    materialOptions?: { opacity?: number; roughness?: number },
  ): THREE.Mesh {
    const geometry = this.getGeometry(geometryKey, makeGeometry);
    const sharedMaterial = materialOverride
      ?? this.getMaterial(materialKey, color, materialOptions, false);
    const meshMaterial = ghost ? sharedMaterial.clone() : sharedMaterial;
    if (ghost) {
      meshMaterial.transparent = true;
      meshMaterial.opacity = Math.min(materialOptions?.opacity ?? 1, 0.38);
      meshMaterial.depthWrite = false;
    }
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.userData.sharedGeometry = true;
    mesh.userData.sharedMaterial = !ghost;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.copy(rotation);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private getGeometry(
    key: string,
    create: () => THREE.BufferGeometry,
  ): THREE.BufferGeometry {
    let geometry = this.sharedGeometries.get(key);
    if (!geometry) {
      geometry = create();
      this.sharedGeometries.set(key, geometry);
    }
    return geometry;
  }

  private getMaterial(
    key: string,
    color: number,
    options: { opacity?: number; roughness?: number } = {},
    ghost = false,
  ): THREE.Material {
    let material = this.sharedMaterials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: options.roughness ?? 0.72,
        metalness: key === 'metal' ? 0.55 : 0.02,
        transparent: (options.opacity ?? 1) < 1,
        opacity: options.opacity ?? 1,
        depthTest: false,
        depthWrite: false,
      });
      this.sharedMaterials.set(key, material);
    }
    if (!ghost) return material;
    const previewMaterial = material.clone();
    previewMaterial.transparent = true;
    previewMaterial.opacity = Math.min(options.opacity ?? 1, 0.38);
    previewMaterial.depthTest = false;
    previewMaterial.depthWrite = false;
    return previewMaterial;
  }

  private stripedShirtMaterial(): THREE.Material {
    let material = this.sharedMaterials.get('bandit-shirt');
    if (!material) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#f2f0e9';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#17191b';
        for (let y = 0; y < canvas.height; y += 32) {
          context.fillRect(0, y, canvas.width, 16);
        }
      }
      this.stripeTexture = new THREE.CanvasTexture(canvas);
      this.stripeTexture.colorSpace = THREE.SRGBColorSpace;
      material = new THREE.MeshStandardMaterial({
        map: this.stripeTexture,
        color: 0xffffff,
        roughness: 0.86,
        depthTest: false,
        depthWrite: false,
      });
      this.sharedMaterials.set('bandit-shirt', material);
    }
    return material;
  }

  private clearPreview(): void {
    if (!this.preview) return;
    this.scene.remove(this.preview.group);
    this.disposeObject(this.preview.group);
    this.preview = null;
  }

  private disposeObject(object: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData.sharedModelResources) return;
      if (!child.userData.sharedGeometry) geometries.add(child.geometry);
      if (!child.userData.sharedMaterial) {
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          materials.add(material);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    const textures = new Set<THREE.Texture>();
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && value !== this.stripeTexture) textures.add(value);
      }
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
  }
}
