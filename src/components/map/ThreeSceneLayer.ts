import * as THREE from 'three';
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type LngLatLike, type Map as MapInstance } from 'maplibre-gl';
import type { Incident, IncidentCategory } from '../../types';
import { CityAssets } from './CityAssets';
import { LivingCity, createCitizen, animatePerson } from './LivingCity';
import { nearestStreet } from './cityGeometry';

const MODEL_ZOOM_THRESHOLD = 15.5;
const COLORS: Record<IncidentCategory, string> = { STREETLIGHT: '#edb24d', POTHOLE: '#ef7955', FLOOD: '#36bad8', SAFETY: '#9972d5', TRAFFIC: '#e9a941' };
type SceneObject = { incident: Incident; group: THREE.Group };

export class ThreeSceneLayer implements CustomLayerInterface {
  readonly id = 'three-scene';
  readonly type = 'custom';
  readonly renderingMode = '3d';
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private assets = new CityAssets();
  private city: LivingCity | null = null;
  private map: MapInstance | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private objects = new Map<string, SceneObject>();
  private incidents: Incident[] = [];
  private world = new THREE.Matrix4();
  private zoom = 17;
  private enabled = true;
  private paused = false;
  private disposed = false;
  private loaded = false;
  private preview: { category: IncidentCategory; group: THREE.Group } | null = null;
  private previewMaterials: THREE.Material[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastTime = 0;
  private elapsed = 0;
  private groundShadow: THREE.Mesh | null = null;
  private sunlight = new THREE.DirectionalLight('#fff1d7', 2.6);
  private resumeVisible = () => { if (!document.hidden) { this.lastTime = 0; this.map?.triggerRepaint(); } };
  private refresh = () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.map || !this.city || !this.loaded || this.disposed || this.map.getZoom() < MODEL_ZOOM_THRESHOLD) return;
      if (this.city.rebuild(this.map)) {
        const p = this.city.toLocal(this.map.getCenter().lng, this.map.getCenter().lat);
        this.groundShadow?.position.set(p.x, .015, p.z);
        this.sunlight.position.set(p.x - 250, 450, p.z - 200);
        this.sunlight.target.position.set(p.x, 0, p.z);
        this.rebuildIncidents();
        if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
        this.map.triggerRepaint();
      }
    }, 200);
  };

  onAdd(map: MapInstance, gl: WebGL2RenderingContext): void {
    this.map = map;
    const origin = MercatorCoordinate.fromLngLat(map.getCenter());
    const scale = origin.meterInMercatorCoordinateUnits();
    this.world.makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.city = new LivingCity(this.assets, origin);
    this.scene.add(this.city.group);
    this.groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.ShadowMaterial({ opacity: .24, depthWrite: false }));
    this.groundShadow.rotation.x = -Math.PI / 2;
    this.groundShadow.position.y = .015;
    this.groundShadow.receiveShadow = true;
    this.scene.add(this.groundShadow);
    this.scene.add(new THREE.HemisphereLight('#dceef5', '#b4b69a', 2));
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sunlight.shadow.camera, { left: -450, right: 450, top: 450, bottom: -450, near: 1, far: 1300 });
    this.sunlight.shadow.bias = -.0003;
    this.sunlight.shadow.normalBias = .2;
    this.sunlight.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sunlight, this.sunlight.target);
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.camera.matrixAutoUpdate = false;
    document.addEventListener('visibilitychange', this.resumeVisible);
    map.on('moveend', this.refresh);
    map.on('sourcedata', this.refresh);
    void this.assets.load().then(() => {
      if (this.disposed) return;
      this.loaded = true;
      this.rebuildIncidents();
      this.refresh();
    });
  }

  render(gl: WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    if (!this.renderer || !this.city || !this.enabled || this.zoom < MODEL_ZOOM_THRESHOLD) return;
    this.camera.projectionMatrix.fromArray(input.defaultProjectionData.mainMatrix).multiply(this.world);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.matrixWorld.identity(); this.camera.matrixWorldInverse.identity();
    const now = performance.now() / 1000;
    const dt = this.paused ? 0 : Math.min(.05, this.lastTime ? now - this.lastTime : 0);
    this.lastTime = now; this.elapsed += dt;
    this.city.animate(dt, this.elapsed);
    // Visit every occurrence. Array.some previously stopped after the first animated object.
    for (const { group } of this.objects.values()) this.animate(group, this.elapsed);
    if (this.preview) this.animate(this.preview.group, this.elapsed);
    this.renderer.resetState();
    // MapLibre owns canvas sizing. Keep Three's cached viewport in sync after
    // opening panels, rotating the phone, or changing device pixel density.
    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();
    if (!this.paused && !document.hidden) this.map?.triggerRepaint();
  }
  private animate(group: THREE.Group, time: number) {
    group.traverse(child => {
      if (child.userData.ripple) {
        const pulse = (time * .24 + child.userData.phase) % 1;
        child.scale.setScalar(2 + pulse * 8);
        (child as THREE.Mesh).visible = pulse < .94;
      }
      if (child.userData.floating) {
        child.position.y = .15 + Math.sin(time * 1.8) * .12;
        child.rotation.z = Math.sin(time * 1.3) * .045;
      }
      if (child.userData.bandit) {
        animatePerson(child as THREE.Group, time);
        child.position.z = child.userData.baseZ + Math.sin(time * .7) * 1.4;
      }
    });
  }
  setIncidents(incidents: Incident[]): void {
    this.incidents = incidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CANCELLED');
    this.city?.setIncidents(this.incidents);
    this.rebuildIncidents();
    this.refresh();
  }
  private rebuildIncidents() {
    if (!this.city) return;
    for (const { group } of this.objects.values()) group.removeFromParent();
    this.objects.clear();
    for (const incident of this.incidents) {
      const group = this.createObject(incident.category);
      group.userData.incidentId = incident.id;
      this.positionAt(group, [incident.longitude, incident.latitude]);
      this.scene.add(group); this.objects.set(incident.id, { incident, group });
    }
    this.city.setIncidents(this.incidents);
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    this.map?.triggerRepaint();
  }
  setZoom(zoom: number) { this.zoom = zoom; this.map?.triggerRepaint(); }
  setEnabled(enabled: boolean) { this.enabled = enabled; this.map?.triggerRepaint(); }
  setPaused(paused: boolean) { this.paused = paused; this.lastTime = 0; this.map?.triggerRepaint(); }
  snapCoordinates(lng: number, lat: number): { lng: number; lat: number } {
    if (!this.city) return { lng, lat };
    const point = this.city.toLocal(lng, lat);
    const street = nearestStreet(point, this.city.streets);
    // Never relocate a distant report to an unrelated street.
    return street && street.distance < 22 ? this.city.toLngLat(street) : { lng, lat };
  }
  private positionAt(group: THREE.Group, coordinates: LngLatLike) {
    if (!this.city) return;
    const lngLat = MercatorCoordinate.fromLngLat(coordinates).toLngLat();
    const p = this.city.toLocal(lngLat.lng, lngLat.lat);
    const road = nearestStreet(p, this.city.streets);
    group.position.set(p.x, .23, p.z);
    group.rotation.y = road && road.distance < 35 ? road.angle : 0;
  }
  setPreview(category: IncidentCategory | null, coordinates: LngLatLike | null) {
    if (!category || !coordinates) { this.clearPreview(); return; }
    if (this.preview?.category !== category) {
      this.clearPreview();
      const group = this.createObject(category);
      group.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = (Array.isArray(child.material) ? child.material : [child.material]).map(material => {
          const clone = material.clone(); clone.transparent = true; clone.opacity = .5; clone.depthWrite = false;
          this.previewMaterials.push(clone); return clone;
        });
        child.material = Array.isArray(child.material) ? materials : materials[0];
        child.castShadow = false;
      });
      this.scene.add(group); this.preview = { group, category };
    }
    this.positionAt(this.preview.group, coordinates);
    this.map?.triggerRepaint();
  }
  hitTest(point: { x: number; y: number }, width: number, height: number): string | null {
    if (!this.enabled || this.zoom < MODEL_ZOOM_THRESHOLD || !width || !height) return null;
    const x = point.x / width * 2 - 1, y = 1 - point.y / height * 2;
    const near = new THREE.Vector3(x, y, -1).unproject(this.camera);
    const far = new THREE.Vector3(x, y, 1).unproject(this.camera);
    const ray = new THREE.Raycaster(near, far.sub(near).normalize());
    const hits = ray.intersectObjects([...this.objects.values()].map(o => o.group), true);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object) { if (object.userData.incidentId) return object.userData.incidentId; object = object.parent; }
    }
    return null;
  }
  private createObject(category: IncidentCategory): THREE.Group {
    const group = new THREE.Group(), a = this.assets;
    const ring = a.mesh(group, 'ring', COLORS[category], [0, .12, 0], [6, 1, 6]);
    ring.castShadow = false;
    if (category === 'FLOOD') {
      const water = a.mesh(group, 'cylinder', '#32a6bf', [0, .14, 0], [18, .28, 26]);
      water.castShadow = false;
      for (let i = 0; i < 3; i++) {
        const ripple = a.mesh(group, 'ring', '#a5e9e5', [0, .34, 0], [1, 1, 1]);
        ripple.userData.ripple = true; ripple.userData.phase = i / 3; ripple.castShadow = false;
      }
      const car = a.model('car_hatchback', 2);
      car.position.set(1, .15, 0); car.userData.floating = true; group.add(car);
      for (const z of [-12, 12]) this.barricade(group, 0, z);
    } else if (category === 'TRAFFIC') {
      for (let i = 0; i < 8; i++) {
        const car = a.model(['car_sedan', 'car_taxi', 'car_hatchback', 'car_stationwagon'][i % 4], 1.9);
        car.position.set(i < 4 ? 2.2 : -2.2, 0, (i % 4 - 1.5) * 5.8);
        car.rotation.y = i < 4 ? 0 : Math.PI; group.add(car);
      }
    } else if (category === 'SAFETY') {
      for (let i = 0; i < 2; i++) {
        const person = createCitizen(a, true, i);
        person.scale.setScalar(1.25);
        person.position.set(i ? 1.6 : -1.6, 0, i ? 1.2 : -1.2);
        person.userData.bandit = true; person.userData.baseZ = person.position.z;
        group.add(person);
      }
    } else if (category === 'POTHOLE') {
      a.mesh(group, 'cylinder', '#85877b', [0, .03, 0], [5, .09, 6]);
      a.mesh(group, 'cylinder', '#222e34', [0, .09, 0], [4, .05, 4.8]);
      for (const [x, z] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) this.cone(group, x, z);
      this.barricade(group, 0, -4.5);
    } else {
      const lamp = a.model('streetlight', 2.1); group.add(lamp);
      a.mesh(group, 'box', '#28333a', [-1.7, 6.3, 0], [.6, .16, .5]);
      this.cone(group, 1.6, .7);
      this.cone(group, -1.6, -.7);
    }
    return group;
  }
  private cone(group: THREE.Group, x: number, z: number) {
    this.assets.mesh(group, 'box', '#364149', [x, .1, z], [.8, .15, .8]);
    this.assets.mesh(group, 'cone', '#f37f3f', [x, .65, z], [.65, 1.1, .65]);
    this.assets.mesh(group, 'cylinder', '#fff2d9', [x, .65, z], [.35, .18, .35]);
  }
  private barricade(group: THREE.Group, x: number, z: number) {
    for (const dx of [-1.5, 1.5]) this.assets.mesh(group, 'box', '#48545c', [x + dx, .65, z], [.12, 1.3, .6]);
    this.assets.mesh(group, 'box', '#f7c85e', [x, 1.1, z], [3.7, .55, .18]);
    for (let dx = -1.5; dx < 1.8; dx += .7) this.assets.mesh(group, 'box', '#45505a', [x + dx, 1.1, z + .1], [.28, .55, .03]);
  }
  private clearPreview() {
    this.preview?.group.removeFromParent(); this.preview = null;
    this.previewMaterials.forEach(material => material.dispose()); this.previewMaterials = [];
    this.map?.triggerRepaint();
  }
  onRemove() {
    this.disposed = true; clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.resumeVisible);
    this.map?.off('moveend', this.refresh); this.map?.off('sourcedata', this.refresh);
    this.clearPreview(); this.city?.dispose(); this.objects.clear();
    this.groundShadow?.geometry.dispose();
    (this.groundShadow?.material as THREE.Material | undefined)?.dispose();
    this.assets.dispose(); this.sunlight.shadow.dispose(); this.scene.clear();
    this.renderer?.dispose(); this.renderer = null; this.map = null;
  }
}
