import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAddresses, searchAddresses } from '../src/services/geocoding';
const feature = { geometry: { type: 'Point', coordinates: [-43.19, -22.91] }, properties: { name: 'Rua Riachuelo', city: 'Rio de Janeiro', country: 'Brasil', osm_key: 'highway' } };
afterEach(() => vi.unstubAllGlobals());
describe('endereços reais', () => {
  it('preserva longitude/latitude e elimina duplicatas ou coordenadas inválidas', () => {
    expect(parseAddresses({ features: [feature, feature, { ...feature, geometry: { type: 'Point', coordinates: [NaN, 100] } }] })).toEqual([{ lng: -43.19, lat: -22.91, label: 'Rua Riachuelo — Rio de Janeiro · Brasil', locality: 'Rio de Janeiro · Brasil', zoom: 18.7 }]);
  });
  it('envia a consulta codificada e reaproveita resultados em cache', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) });
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await searchAddresses('Rua Riachuelo, Rio de Janeiro', signal);
    await searchAddresses('Rua Riachuelo, Rio de Janeiro', signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].searchParams.get('q')).toBe('Rua Riachuelo, Rio de Janeiro');
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
  });
  it('não trata erro do provedor como ausência de resultados', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(searchAddresses('endereço indisponível', new AbortController().signal)).rejects.toThrow('indisponível');
    expect(() => parseAddresses({ error: 'unavailable' })).toThrow();
  });
});
