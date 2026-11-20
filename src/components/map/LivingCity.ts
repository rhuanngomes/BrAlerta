import * as THREE from 'three';
import { MercatorCoordinate, type Map as MapInstance } from 'maplibre-gl';
import { CityAssets, CityBatch, BUILDINGS, disposeInstances } from './CityAssets';
import { hash, nearestStreet, pointInPolygon, sampleStreet, streetLength, type Point, type Street } from './cityGeometry';
import type { Incident } from '../../types';

type Actor = { group: THREE.Group; street: Street; distance: number; length: number; direction: number; walking: boolean; speed: number };
type Zone = Point & { category: Incident['category'] };

export class LivingCity {
  readonly group = new THREE.Group();
  streets: Street[] = [];
  private decor = new THREE.Group();
  private actors: Actor[] = [];
  private zones: Zone[] = [];
  private origin: MercatorCoordinate;
  private units: number;
  private footprintRings: Point[][] = [];
  private maskRings: Point[][] = [];
  private lastSignature = '';

  constructor(private assets: CityAssets, origin: MercatorCoordinate) {
    this.origin = origin; this.units = origin.meterInMercatorCoordinateUnits();
    this.group.add(this.decor);
  }
  toLocal(lng: number, lat: number): Point {
    const p = MercatorCoordinate.fromLngLat([lng, lat]);
    return { x: (p.x - this.origin.x) / this.units, z: (p.y - this.origin.y) / this.units };
  }
  toLngLat(point: Point): { lng: number; lat: number } {
    return new MercatorCoordinate(this.origin.x + point.x * this.units, this.origin.y + point.z * this.units).toLngLat();
  }
  setIncidents(incidents: Incident[]) {
    this.zones = incidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CANCELLED').map(i => ({ ...this.toLocal(i.longitude, i.latitude), category: i.category }));
  }
  rebuild(map: MapInstance): boolean {
    if (!map.getSource('openmaptiles')) return false;
    const center = this.toLocal(map.getCenter().lng, map.getCenter().lat);
    const radius = 650;
    const nearby = (p: Point) => Math.hypot(p.x - center.x, p.z - center.z) < radius;
    const roadFeatures = map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' });
    const buildingFeatures = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' });
    const zoneSignature = this.zones.map(zone => `${zone.category}:${zone.x.toFixed(1)},${zone.z.toFixed(1)}`).sort().join(';');
    const signature = `${Math.round(center.x / 100)},${Math.round(center.z / 100)}:${roadFeatures.length}:${buildingFeatures.length}:${Math.floor(map.getZoom())}:${zoneSignature}`;
    if (signature === this.lastSignature || !roadFeatures.length) return false;
    this.lastSignature = signature;
    const unique = new Set<string>();
    const streets: Street[] = [];
    for (const feature of roadFeatures) {
      const kind = feature.properties.class as string;
      if (!['minor', 'tertiary', 'secondary', 'primary', 'residential', 'service', 'trunk'].includes(kind)) continue;
      if (Number(feature.properties.layer ?? 0) !== 0 || feature.properties.brunnel) continue;
      const geometry = feature.geometry;
      const lines: number[][][] = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
      for (const line of lines) {
        const points = line.map(p => this.toLocal(p[0], p[1]));
        if (points.length < 2 || !points.some(nearby)) continue;
        const key = points.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';');
        const reverse = [...points].reverse().map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';');
        if (unique.has(key) || unique.has(reverse)) continue;
        unique.add(key);
        streets.push({ points, key, width: ['primary', 'trunk'].includes(kind) ? 14 : kind === 'secondary' ? 12 : kind === 'service' ? 6 : 9 });
      }
    }
    this.streets = streets;
    this.footprintRings = [];
    for (const feature of buildingFeatures) {
      const g = feature.geometry;
      const polygons: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const polygon of polygons) {
        const ring = polygon[0].map(p => this.toLocal(p[0], p[1]));
        if (ring.some(nearby)) this.footprintRings.push(ring);
      }
    }
    this.maskRings = [];
    // Keep illustrative lots out of mapped water, parks and recreation grounds.
    for (const sourceLayer of ['water', 'landuse', 'landcover']) {
      for (const feature of map.querySourceFeatures('openmaptiles', { sourceLayer })) {
        if (sourceLayer !== 'water' && !['park', 'grass', 'wood', 'recreation_ground', 'cemetery', 'sand'].includes(feature.properties.class)) continue;
        const g = feature.geometry;
        const polygons: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const polygon of polygons) this.maskRings.push(polygon[0].map(p => this.toLocal(p[0], p[1])));
      }
    }
    disposeInstances(this.decor);
    for (const actor of this.actors) actor.group.removeFromParent();
    this.actors = [];
    const batch = new CityBatch(this.assets);
    const lots: Array<Point & { radius: number }> = [];
    const occupied = (p: Point, radius: number) => lots.some(lot => Math.hypot(p.x - lot.x, p.z - lot.z) < radius + lot.radius);
    const onRoad = (p: Point, clearance: number) => {
      const road = nearestStreet(p, streets);
      return !!road && road.distance < road.street.width / 2 + clearance;
    };
    const masked = (p: Point) => this.maskRings.some(ring => pointInPolygon(p, ring));
    const addLot = (p: Point, angle: number, width: number, depth: number, seed: number) => {
      const radius = Math.hypot(width, depth) / 2;
      if (occupied(p, radius * .75)) return;
      lots.push({ ...p, radius: radius * .75 });
      batch.box('#c7c9be', p.x, .12, p.z, width + 1.4, .24, depth + 1.4, angle);
      const name = BUILDINGS[seed % BUILDINGS.length];
      if (this.assets.parts(name).length) {
        batch.model(name, p.x, .26, p.z, width, angle, depth);
        const size = this.assets.size(name);
        const height = size.y * Math.min(width / size.x, 7.5);
        const localBox = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
          batch.box(color, p.x + Math.cos(angle) * x + Math.sin(angle) * z, y + .26, p.z - Math.sin(angle) * x + Math.cos(angle) * z, w, h, d, angle);
        };
        // The source facades face the street; finish their blank rear and side walls too.
        const floors = Math.max(2, Math.round(size.y / .7));
        const floorHeight = height / floors;
        for (let y = floorHeight * .52; y < height - .7; y += floorHeight) {
          for (let x = -width / 2 + 2; x < width / 2 - 1; x += 3.2) {
            localBox('#e6dece', x, y, -depth / 2 - .04, 1.45, 1.85, .12);
            localBox('#607f8e', x, y + .05, -depth / 2 - .12, 1.16, 1.55, .08);
          }
          for (const side of [-1, 1]) for (let z = -depth / 2 + 2; z < depth / 2 - 2; z += 3.4) {
            localBox('#ded8c8', side * (width / 2 + .04), y, z, .12, 1.85, 1.45);
            localBox('#607f8e', side * (width / 2 + .12), y + .05, z, .08, 1.55, 1.16);
          }
        }
        localBox('#b6beb5', -width * .18, height + .55, 0, 2.2, 1, 2.5);
        localBox('#7c8b86', -width * .18, height + 1.08, 0, 1.6, .12, 1.9);
        if (seed % 3 === 0) localBox('#3f626e', width * .18, height + .18, 0, 2.8, .2, 3.5);
      } else {
        const height = width * (1 + seed % 3 * .25);
        batch.box('#d7c9b4', p.x, height / 2, p.z, width, height, depth, angle);
        batch.box('#f1eee1', p.x, height, p.z, width + .3, .4, depth + .3, angle);
      }
    };
    // Occupied footprints anchor the city. Model axes follow the longest real facade edge.
    const seenBuildings = new Set<string>();
    for (const ring of this.footprintRings) {
      if (lots.length > 350) break;
      let edge = { x: 1, z: 0 }, longest = 0;
      for (let i = 1; i < ring.length; i++) {
        const dx = ring[i].x - ring[i - 1].x, dz = ring[i].z - ring[i - 1].z, length = Math.hypot(dx, dz);
        if (length > longest) { longest = length; edge = { x: dx / length, z: dz / length }; }
      }
      const u = ring.map(p => p.x * edge.x + p.z * edge.z), v = ring.map(p => -p.x * edge.z + p.z * edge.x);
      const minU = Math.min(...u), maxU = Math.max(...u), minV = Math.min(...v), maxV = Math.max(...v);
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      const p = { x: cu * edge.x - cv * edge.z, z: cu * edge.z + cv * edge.x };
      const key = `${p.x.toFixed(0)},${p.z.toFixed(0)}`;
      if (seenBuildings.has(key) || !nearby(p) || !pointInPolygon(p, ring) || onRoad(p, 4)) continue;
      seenBuildings.add(key);
      const width = Math.min(18, (maxU - minU) * .86), depth = Math.min(18, (maxV - minV) * .86);
      if (width < 5 || depth < 5) continue;
      let angle = -Math.atan2(edge.z, edge.x);
      const road = nearestStreet(p, streets);
      if (road && Math.sin(angle) * (road.x - p.x) + Math.cos(angle) * (road.z - p.z) < 0) angle += Math.PI;
      addLot(p, angle, width, depth, hash(key));
    }
    for (const street of streets) {
      const length = streetLength(street), seed = hash(street.key);
      // Continuous asphalt and raised sidewalks use the exact source polyline, never a synthetic grid.
      for (let i = 1; i < street.points.length; i++) {
        const a = street.points[i - 1], b = street.points[i], dx = b.x - a.x, dz = b.z - a.z;
        const l = Math.hypot(dx, dz), angle = Math.atan2(dx, dz), x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
        if (l < .1) continue;
        batch.box('#bec4bd', x, .06, z, street.width + 4.5, .12, l + .1, angle);
        batch.box('#454e54', x, .14, z, street.width, .08, l + .2, angle);
      }
      for (let d = 7; d < length - 7; d += 9) {
        const p = sampleStreet(street, d);
        batch.box('#ebe9d5', p.x, .19, p.z, .13, .02, 3, p.angle);
      }
      for (let d = 12; d < length - 10; d += 28) {
        for (const side of [-1, 1]) {
          const p = sampleStreet(street, d, side * (street.width / 2 + 1.35));
          if (!nearby(p) || onRoad(p, .7) || occupied(p, 2)) continue;
          // Keep the report readable: foreground canopies must not conceal its actors.
          if (this.zones.some(zone => Math.hypot(zone.x - p.x, zone.z - p.z) < 12)) continue;
          batch.tree(p.x, p.z, seed + Math.round(d));
          const lamp = sampleStreet(street, d + 9, side * (street.width / 2 + .8));
          batch.model('streetlight', lamp.x, .2, lamp.z, 1.65, p.angle + (side < 0 ? Math.PI : 0));
          if (Math.round(d) % 3 === 0) {
            const bench = sampleStreet(street, d - 5, side * (street.width / 2 + 1.3));
            batch.model('bench', bench.x, .2, bench.z, 2, p.angle);
          }
        }
      }
      // Where OSM has no building footprints, add clearly illustrative roadside lots.
      for (let d = 22; d < length - 18 && lots.length < 430; d += 27) for (const side of [-1, 1]) {
        const p = sampleStreet(street, d, side * (street.width / 2 + 12));
        if (!nearby(p) || onRoad(p, 8) || masked(p) || this.footprintRings.some(r => pointInPolygon(p, r))) continue;
        const corners = [-1, 1].flatMap(a => [-1, 1].map(b => ({ x: p.x + a * 7, z: p.z + b * 7 })));
        if (corners.some(c => onRoad(c, 2) || masked(c))) continue;
        addLot(p, p.angle + (side < 0 ? Math.PI / 2 : -Math.PI / 2), 12 + seed % 4, 13, seed + Math.round(d) + side);
      }
      if (length > 28) {
        // Mark both approaches; cut back from the junction centre.
        for (const d of [8, length - 8]) {
          const p = sampleStreet(street, d);
          for (let lane = -street.width / 2 + .8; lane < street.width / 2; lane += 1.1) {
            const cross = sampleStreet(street, d, lane);
            batch.box('#f5f2e6', cross.x, .2, cross.z, .55, .02, 2.8, p.angle);
          }
          const light = sampleStreet(street, d + 3, street.width / 2 + 1);
          batch.model('trafficlight_A', light.x, .2, light.z, .8, p.angle);
        }
        if (this.actors.length < 100) {
          const count = Math.min(4, Math.floor(length / 65) + 1);
          for (let i = 0; i < count; i++) {
            const group = this.assets.model(['car_sedan', 'car_hatchback', 'car_taxi', 'car_stationwagon'][(seed + i) % 4], 1.9);
            group.traverse(child => { child.castShadow = false; });
            this.group.add(group);
            this.actors.push({ group, street, distance: length * (i + .3) / count, length, direction: i % 2 ? -1 : 1, walking: false, speed: 5 + seed % 4 });
          }
          if (seed % 2 === 0) for (let i = 0; i < 2; i++) {
            const group = createCitizen(this.assets, false, seed + i);
            group.traverse(child => { child.castShadow = false; });
            this.group.add(group);
            this.actors.push({ group, street, distance: length * (.3 + i * .4), length, direction: i ? -1 : 1, walking: true, speed: .9 });
          }
        }
      }
    }
    this.decor = batch.finish(); this.group.add(this.decor);
    this.animate(0, 0);
    return true;
  }
  animate(dt: number, time: number) {
    for (const actor of this.actors) {
      const current = sampleStreet(actor.street, actor.distance);
      let speed = actor.speed;
      if (!actor.walking) for (const zone of this.zones) {
        const distance = Math.hypot(current.x - zone.x, current.z - zone.z);
        if (zone.category === 'TRAFFIC' && distance < 65) speed = .65;
        if ((zone.category === 'FLOOD' || zone.category === 'POTHOLE') && distance < 13) speed = 0;
      }
      actor.distance += dt * speed * actor.direction;
      if (actor.distance > actor.length) actor.distance = 0;
      if (actor.distance < 0) actor.distance = actor.length;
      const offset = actor.walking ? actor.street.width / 2 + 1.4 : actor.street.width / 4;
      const p = sampleStreet(actor.street, actor.distance, offset * actor.direction);
      actor.group.position.set(p.x, .21, p.z);
      actor.group.rotation.y = p.angle + (actor.direction < 0 ? Math.PI : 0);
      if (actor.walking) animatePerson(actor.group, time);
    }
  }
  dispose() { disposeInstances(this.decor); this.group.clear(); this.actors = []; }
}

export function createCitizen(assets: CityAssets, bandit: boolean, seed = 0): THREE.Group {
  const group = new THREE.Group();
  const shirt = bandit ? '#e4e6de' : ['#d97c52', '#619fac', '#d4af53', '#687b9b'][seed % 4];
  assets.mesh(group, 'box', shirt, [0, 1.05, 0], [.52, .65, .32]);
  if (bandit) for (const y of [.84, 1.02, 1.2]) assets.mesh(group, 'box', '#26303b', [0, y, 0], [.53, .08, .33]);
  assets.mesh(group, 'sphere', '#dca785', [0, 1.64, 0], [.45, .48, .44]);
  assets.mesh(group, 'sphere', bandit ? '#202c34' : '#514039', [0, 1.83, 0], [.46, .21, .46]);
  if (bandit) {
    assets.mesh(group, 'box', '#202c34', [0, 1.66, .19], [.4, .12, .07]);
    assets.mesh(group, 'sphere', '#7c7253', [.4, .95, -.15], [.55, .65, .48]);
  }
  for (const side of [-1, 1]) {
    const leg = assets.mesh(group, 'box', '#2a3c4a', [side * .16, .44, 0], [.2, .65, .23]);
    leg.userData.leg = side;
    assets.mesh(group, 'box', '#333b3f', [side * .16, .1, .07], [.25, .16, .38]);
    const arm = assets.mesh(group, 'box', shirt, [side * .36, 1.02, 0], [.15, .52, .2]);
    arm.userData.leg = -side;
    assets.mesh(group, 'sphere', '#dca785', [side * .36, .73, 0], [.16, .2, .18]);
  }
  return group;
}
export function animatePerson(group: THREE.Group, time: number) {
  for (const child of group.children) if (child.userData.leg) child.rotation.x = Math.sin(time * 5) * .35 * child.userData.leg;
}
