import * as THREE from 'three';
import { MercatorCoordinate } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { CityAssets } from '../src/components/map/CityAssets';
import { LivingCity } from '../src/components/map/LivingCity';
import { ThreeSceneLayer } from '../src/components/map/ThreeSceneLayer';
import type { Incident } from '../src/types';

const incident = (category: Incident['category'], status: Incident['status'] = 'PENDING'): Incident => ({
  id: category, userId: 'test', category, status, title: category, description: 'Test',
  latitude: -23.0228, longitude: -43.4628, createdAt: '', updatedAt: '', history: [],
});

describe('living city occurrence lifecycle', () => {
  it('round trips geographic coordinates without arbitrary visual scaling', () => {
    const assets = new CityAssets();
    const city = new LivingCity(assets, MercatorCoordinate.fromLngLat([-43.4628, -23.0228]));
    const p = city.toLocal(-43.4621, -23.0232);
    expect(p.x).toBeGreaterThan(60);
    expect(p.x).toBeLessThan(80);
    const result = city.toLngLat(p);
    expect(result.lng).toBeCloseTo(-43.4621, 8);
    expect(result.lat).toBeCloseTo(-23.0232, 8);
    city.dispose(); assets.dispose();
  });
  it('creates two bandits, eight queued cars and removes resolved or cancelled effects', () => {
    const layer = new ThreeSceneLayer();
    // CPU scene inspection: no browser/WebGL is needed to verify semantic objects and cleanup.
    const internals = layer as unknown as { city: LivingCity; assets: CityAssets; objects: Map<string, { group: THREE.Group }> };
    internals.city = new LivingCity(internals.assets, MercatorCoordinate.fromLngLat([-43.4628, -23.0228]));
    layer.setIncidents([incident('SAFETY'), incident('TRAFFIC'), incident('FLOOD')]);
    expect(internals.objects.get('SAFETY')!.group.children.filter(c => c.userData.bandit)).toHaveLength(2);
    expect(internals.objects.get('TRAFFIC')!.group.children.filter(c => c instanceof THREE.Group)).toHaveLength(8);
    expect(internals.objects.get('FLOOD')!.group.children.filter(c => c.userData.floating)).toHaveLength(1);
    layer.setIncidents([incident('SAFETY', 'RESOLVED'), incident('TRAFFIC', 'CANCELLED'), incident('FLOOD')]);
    expect([...internals.objects.keys()]).toEqual(['FLOOD']);
    layer.onRemove();
    expect(internals.objects.size).toBe(0);
  });
});
