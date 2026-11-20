import { describe, expect, it } from 'vitest';
import { nearestStreet, pointInPolygon, sampleStreet, streetLength, type Street } from '../src/components/map/cityGeometry';

const street: Street = { key: 'corner', width: 9, points: [{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: 100, z: 100 }] };

describe('geographic street alignment', () => {
  it('snaps to the nearest segment and preserves the actual direction around a corner', () => {
    expect(nearestStreet({ x: 6, z: 40 }, [street])).toMatchObject({ x: 0, z: 40, distance: 6, angle: 0, along: 40 });
    expect(nearestStreet({ x: 60, z: 104 }, [street])).toMatchObject({ x: 60, z: 100, distance: 4, angle: Math.PI / 2, along: 160 });
  });
  it('keeps traffic on a continuous polyline with a perpendicular lane offset', () => {
    expect(streetLength(street)).toBe(200);
    expect(sampleStreet(street, 40, 2)).toMatchObject({ x: 2, z: 40, angle: 0 });
    expect(sampleStreet(street, 160, 2)).toMatchObject({ x: 60, z: 98, angle: Math.PI / 2 });
  });
  it('does not extrapolate past a street endpoint or fail on duplicate vertices', () => {
    const duplicate = { ...street, points: [{ x: 0, z: 0 }, ...street.points] };
    expect(sampleStreet(duplicate, -4)).toMatchObject({ x: 0, z: 0 });
    expect(sampleStreet(duplicate, 500)).toMatchObject({ x: 100, z: 100 });
    expect(nearestStreet({ x: 110, z: 100 }, [duplicate])).toMatchObject({ x: 100, z: 100, distance: 10 });
    expect(nearestStreet({ x: 0, z: 0 }, [])).toBeNull();
  });
  it('excludes water and park polygons from decorative building placement', () => {
    const ring = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
    expect(pointInPolygon({ x: 5, z: 5 }, ring)).toBe(true);
    expect(pointInPolygon({ x: 12, z: 5 }, ring)).toBe(false);
  });
});
