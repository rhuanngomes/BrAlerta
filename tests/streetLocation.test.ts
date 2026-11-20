import { expect, it } from 'vitest';
import { nearestStreet } from '../src/components/map/streetLocation';
it('identifica a rua pelo segmento mesmo com vértices distantes do centro', () => {
  expect(nearestStreet([
    { properties: { name: 'Rua distante' }, geometry: { type: 'LineString', coordinates: [[-43.01, -23], [-43.01, -22.9]] } },
    { properties: { name: 'Rua do centro' }, geometry: { type: 'LineString', coordinates: [[-43, -23.1], [-43, -22.9]] } },
  ], -43.0001, -23)).toBe('Rua do centro');
});
it('não inventa uma rua quando a cobertura não oferece nomes próximos', () => {
  expect(nearestStreet([], -43, -23)).toBeNull();
  expect(nearestStreet([{ properties: { name: 'Longe' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] } }], -43, -23)).toBeNull();
});
