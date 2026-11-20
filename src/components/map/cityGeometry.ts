/** Coordinates in a local, metre-based frame: x east, z south. */
export type Point = { x: number; z: number };
export type Street = { points: Point[]; width: number; key: string };
export type StreetPosition = Point & { angle: number; distance: number; street: Street; along: number };

export function nearestStreet(point: Point, streets: Street[]): StreetPosition | null {
  let nearest: StreetPosition | null = null;
  for (const street of streets) {
    let along = 0;
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1], b = street.points[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length ** 2));
      const x = a.x + dx * t, z = a.z + dz * t;
      const distance = Math.hypot(point.x - x, point.z - z);
      if (!nearest || distance < nearest.distance) {
        nearest = { x, z, distance, angle: Math.atan2(dx, dz), street, along: along + t * length };
      }
      along += length;
    }
  }
  return nearest;
}

export function streetLength(street: Street): number {
  return street.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - street.points[i].x, p.z - street.points[i].z), 0);
}

export function sampleStreet(street: Street, distance: number, offset = 0): Point & { angle: number } {
  const total = streetLength(street);
  let remaining = Math.max(0, Math.min(total, distance));
  for (let i = 1; i < street.points.length; i++) {
    const a = street.points[i - 1], b = street.points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01) continue;
    if (remaining <= length || i === street.points.length - 1) {
      const t = Math.min(1, remaining / length), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
      return { x: a.x + (b.x - a.x) * t + dz * offset, z: a.z + (b.z - a.z) * t - dx * offset, angle: Math.atan2(dx, dz) };
    }
    remaining -= length;
  }
  return { ...street.points[0], angle: 0 };
}

export function pointInPolygon(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Stable variation when the camera moves; never randomize a lot on rebuild. */
export function hash(value: string): number {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}
