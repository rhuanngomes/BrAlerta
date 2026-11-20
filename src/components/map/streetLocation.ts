type NamedFeature = { properties: Record<string, unknown> | null; geometry: { type: string; coordinates?: unknown } };

/** Distance to road segments, rather than their vertices, keeps long roads discoverable. */
export function nearestStreet(features: NamedFeature[], lng: number, lat: number, maxDistance = 180): string | null {
  let distance = maxDistance;
  let name: string | null = null;
  const xScale = 111320 * Math.cos(lat * Math.PI / 180);
  for (const feature of features) {
    const candidate = feature.properties?.['name:pt'] || feature.properties?.name;
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const coordinates = feature.geometry.coordinates;
    const lines = feature.geometry.type === 'LineString' ? [coordinates] : feature.geometry.type === 'MultiLineString' && Array.isArray(coordinates) ? coordinates : [];
    for (const line of lines) {
      if (!Array.isArray(line)) continue;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        if (!Array.isArray(a) || !Array.isArray(b) || ![a[0], a[1], b[0], b[1]].every(Number.isFinite)) continue;
        const ax = (a[0] - lng) * xScale, ay = (a[1] - lat) * 111320;
        const bx = (b[0] - lng) * xScale, by = (b[1] - lat) * 111320;
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < distance) { distance = d; name = candidate; }
      }
    }
  }
  return name;
}
