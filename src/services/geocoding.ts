export interface AddressResult {
  lat: number;
  lng: number;
  label: string;
  locality: string;
  zoom: number;
}

const cache = new Map<string, AddressResult[]>();

export function parseAddresses(data: unknown): AddressResult[] {
  if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features)) {
    throw new Error('A busca retornou uma resposta inválida. Tente novamente.');
  }
  const seen = new Set<string>();
  return data.features.flatMap((feature) => {
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return [];
    const [lng, lat] = coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) return [];
    const p = feature.properties ?? {};
    const strings = (values: unknown[]) => [...new Set(values.filter((s): s is string => typeof s === 'string' && !!s.trim()))];
    const street = strings([p.street, p.housenumber]).join(', ');
    const locality = strings([p.city || p.town || p.village, p.state, p.country]).join(' · ');
    const label = strings([p.name, street, p.district || p.locality, locality]).join(' — ');
    const key = label.toLocaleLowerCase('pt-BR');
    if (!label || seen.has(key)) return [];
    seen.add(key);
    return [{ lng, lat, label, locality, zoom: p.osm_key === 'place' && !street ? 14 : 18.7 }];
  });
}

export async function searchAddresses(query: string, signal: AbortSignal): Promise<AddressResult[]> {
  const clean = query.trim();
  if (clean.length < 3) return [];
  const key = clean.toLocaleLowerCase('pt-BR');
  if (cache.has(key)) return cache.get(key)!;
  const url = new URL(import.meta.env.VITE_GEOCODING_URL || 'https://photon.komoot.io/api/');
  url.searchParams.set('q', clean);
  url.searchParams.set('limit', '6');
  // Prefer the initial city without restricting searches elsewhere in Brazil.
  url.searchParams.set('lat', '-23.0228');
  url.searchParams.set('lon', '-43.4628');
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('O serviço de endereços está indisponível. Tente novamente.');
  const results = parseAddresses(await response.json());
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const requestedName = normalize(clean.split(',')[0]);
  results.sort((a, b) => Number(normalize(b.label).startsWith(requestedName)) - Number(normalize(a.label).startsWith(requestedName)));
  if (cache.size >= 40) cache.delete(cache.keys().next().value!);
  cache.set(key, results);
  return results;
}
