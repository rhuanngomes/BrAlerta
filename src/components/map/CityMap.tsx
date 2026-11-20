import { nearestStreet } from './streetLocation';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type {
  ExpressionSpecification,
  FillExtrusionLayerSpecification,
  Map as MapInstance,
  MapMouseEvent,
  Marker,
} from 'maplibre-gl';
import { Crosshair, LocateFixed, Minus, Plus, Pause, Play, Navigation, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Incident, IncidentCategory } from '../../types';
import { incidentCategoryLabels } from '../../types';
import type { ThreeSceneLayer as ThreeSceneLayerType } from './ThreeSceneLayer';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const CENTER: [number, number] = [-43.4628, -23.0228];
const INITIAL_PITCH = 55;
const INITIAL_ZOOM = 18.7;
const MODEL_ZOOM_THRESHOLD = 15.5;
const buildingLayerId = '3d-buildings';
const sceneLayerId = 'three-scene';

const categoryOptions: Array<{ value: IncidentCategory; icon: string }> = [
  { value: 'STREETLIGHT', icon: '💡' },
  { value: 'POTHOLE', icon: '⚠️' },
  { value: 'FLOOD', icon: '🌊' },
  { value: 'SAFETY', icon: '🛡️' },
  { value: 'TRAFFIC', icon: '🚗' },
];

type Coordinates = { lat: number; lng: number };

type CityMapProps = {
  incidents: Incident[];
  selectedId?: string;
  placing?: IncidentCategory | null;
  onSelect: (incident: Incident) => void;
  onPlace: (coordinates: Coordinates) => void;
  onSetPlacing: (category: IncidentCategory | null) => void;
  focus?: (Coordinates & { zoom?: number; label?: string; locality?: string }) | null;
  draftCoordinates?: Coordinates | null;
};

function createBuildingLayer(): FillExtrusionLayerSpecification {
  return {
    id: buildingLayerId,
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    maxzoom: MODEL_ZOOM_THRESHOLD,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': '#d5cbb7',
      'fill-extrusion-height': [
        'coalesce',
        ['to-number', ['get', 'render_height']],
        ['to-number', ['get', 'height']],
        0,
      ] as ExpressionSpecification,
      'fill-extrusion-base': [
        'coalesce',
        ['to-number', ['get', 'render_min_height']],
        ['to-number', ['get', 'min_height']],
        0,
      ] as ExpressionSpecification,
      'fill-extrusion-opacity': 0.86,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}

export function CityMap({
  incidents,
  selectedId,
  placing = null,
  onSelect,
  onPlace,
  onSetPlacing,
  focus,
  draftCoordinates = null,
}: CityMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const sceneLayer = useRef<ThreeSceneLayerType | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const readyMarkers = useRef<Map<string, Marker> | null>(null);
  const incidentsRef = useRef(incidents);
  const callbacks = useRef({ onSelect, onPlace, onSetPlacing });
  const placingRef = useRef(placing);
  const draftRef = useRef(draftCoordinates);
  const labelsHidden = useRef<boolean | null>(null);
  const paletteButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const [is3d, setIs3d] = useState(true);
  const is3dRef = useRef(is3d);
  const [paused, setPaused] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const pausedRef = useRef(paused);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [streetLocation, setStreetLocation] = useState('Localizando rua…');
  const [centerCoordinates, setCenterCoordinates] = useState('');
  const [zoomLevel, setZoomLevel] = useState(INITIAL_ZOOM);
  useEffect(() => { pausedRef.current = paused; sceneLayer.current?.setPaused(paused); }, [paused]);

  useEffect(() => {
    incidentsRef.current = incidents;
    callbacks.current = { onSelect, onPlace, onSetPlacing };
    placingRef.current = placing;
    draftRef.current = draftCoordinates;
    is3dRef.current = is3d;
  }, [incidents, is3d, onPlace, onSelect, onSetPlacing, placing, draftCoordinates]);

  useEffect(() => {
    if (!element.current) return;

    let disposed = false;
    const mapMarkers = markers.current;
    readyMarkers.current = mapMarkers;
    const instance = new maplibregl.Map({
      container: element.current,
      center: CENTER,
      zoom: INITIAL_ZOOM,
      pitch: INITIAL_PITCH,
      bearing: -28,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      maxPitch: 65,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    });
    map.current = instance;
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(element.current);

    const ensureLayers = () => {
      setMapReady(true); setMapError(false);
      labelsHidden.current = null;
      for (const layer of instance.getStyle().layers ?? []) {
        if (layer.type === 'fill-extrusion') instance.setLayoutProperty(layer.id, 'visibility', 'none');
        if (layer.type === 'background') instance.setPaintProperty(layer.id, 'background-color', '#e4e4d7');
        if (layer.type === 'fill' && /water/.test(layer.id)) instance.setPaintProperty(layer.id, 'fill-color', '#8ac8d1');
        if (layer.type === 'fill' && /park|grass|wood/.test(layer.id)) instance.setPaintProperty(layer.id, 'fill-color', '#b6cf91');
        if (layer.type === 'symbol' && /poi|housenumber/.test(layer.id)) instance.setLayoutProperty(layer.id, 'visibility', 'none');
      }
      if (!instance.getLayer(buildingLayerId)) {
        const firstSymbol = instance.getStyle().layers?.find(
          (layer) => layer.type === 'symbol',
        );
        instance.addLayer(createBuildingLayer(), firstSymbol?.id);
      }

      if (!instance.getLayer(sceneLayerId)) {
        void ensureSceneLayer().catch((error: unknown) => {
          console.error('Não foi possível carregar a cena 3D de ocorrências.', error);
        });
      }

      instance.setLayoutProperty(
        buildingLayerId,
        'visibility',
        is3dRef.current ? 'visible' : 'none',
      );
    };

    const ensureSceneLayer = async () => {
      const { ThreeSceneLayer } = await import('./ThreeSceneLayer');
      if (
        disposed
        || map.current !== instance
        || instance.getLayer(sceneLayerId)
      ) return;

      const layer = new ThreeSceneLayer();
      sceneLayer.current = layer;
      const firstSymbol = instance.getStyle().layers?.find(
        (styleLayer) => styleLayer.type === 'symbol',
      );
      instance.addLayer(layer, firstSymbol?.id);
      layer.setIncidents(incidentsRef.current);
      layer.setZoom(instance.getZoom());
      layer.setEnabled(is3dRef.current);
      for (const styleLayer of instance.getStyle().layers ?? []) {
        if (styleLayer.type === 'symbol') instance.setLayoutProperty(styleLayer.id, 'visibility', is3dRef.current && instance.getZoom() >= MODEL_ZOOM_THRESHOLD ? 'none' : 'visible');
      }
      layer.setPaused(pausedRef.current);
    };

    const updateZoomState = () => {
      const zoom = instance.getZoom();
      setZoomLevel(zoom);
      sceneLayer.current?.setZoom(zoom);
      const hidden = is3dRef.current && zoom >= MODEL_ZOOM_THRESHOLD;
      if (labelsHidden.current !== hidden) {
        for (const layer of instance.getStyle()?.layers ?? []) {
          if (layer.type === 'symbol') instance.setLayoutProperty(layer.id, 'visibility', hidden ? 'none' : 'visible');
        }
        labelsHidden.current = hidden;
      }
      const offset: [number, number] = zoom >= MODEL_ZOOM_THRESHOLD ? [0, -12] : [0, 0];
      for (const marker of mapMarkers.values()) marker.setOffset(offset);
    };

    const handleClick = (event: MapMouseEvent) => {
      if (placingRef.current) {
        const position = sceneLayer.current?.snapCoordinates(event.lngLat.lng, event.lngLat.lat) ?? event.lngLat;
        callbacks.current.onPlace({ lat: position.lat, lng: position.lng });
        sceneLayer.current?.setPreview(placingRef.current, [position.lng, position.lat]);
        return;
      }
      const canvas = instance.getCanvas();
      const hitId = sceneLayer.current?.hitTest(
        event.point,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      if (hitId) {
        const incident = incidentsRef.current.find((item) => item.id === hitId);
        if (incident) {
          callbacks.current.onSelect(incident);
          return;
        }
      }

    };

    const handleMove = (event: MapMouseEvent) => {
      if (draftRef.current) return;
      const category = placingRef.current;
      const position = sceneLayer.current?.snapCoordinates(event.lngLat.lng, event.lngLat.lat) ?? event.lngLat;
      sceneLayer.current?.setPreview(
        category,
        category && is3dRef.current && instance.getZoom() >= MODEL_ZOOM_THRESHOLD
          ? [position.lng, position.lat]
          : null,
      );
    };

    let streetTimer: number | undefined;
    const updateStreet = () => {
      const center = instance.getCenter();
      setCenterCoordinates(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
      if (!instance.getSource('openmaptiles')) return;
      const features = instance.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation_name' });
      const street = nearestStreet(features, center.lng, center.lat);
      setStreetLocation(street ? `Próximo a ${street}` : 'Explore o mapa para localizar uma rua');
    };
    const scheduleStreet = () => {
      if (streetTimer !== undefined) return;
      streetTimer = window.setTimeout(() => { streetTimer = undefined; if (!disposed) updateStreet(); }, 350);
    };
    instance.on('moveend', scheduleStreet);
    instance.on('sourcedata', scheduleStreet);
    instance.on('style.load', ensureLayers);
    instance.on('error', () => { if (!instance.isStyleLoaded()) setMapError(true); });
    instance.on('zoom', updateZoomState);
    instance.on('click', handleClick);
    instance.on('mousemove', handleMove);

    return () => {
      disposed = true;
      window.clearTimeout(streetTimer);
      instance.off('moveend', scheduleStreet);
      instance.off('sourcedata', scheduleStreet);
      resizeObserver.disconnect();
      instance.off('style.load', ensureLayers);
      instance.off('zoom', updateZoomState);
      instance.off('click', handleClick);
      instance.off('mousemove', handleMove);
      for (const marker of mapMarkers.values()) marker.remove();
      mapMarkers.clear();
      readyMarkers.current = null;
      instance.remove();
      map.current = null;
      sceneLayer.current = null;
    };
  }, []);

  useEffect(() => {
    sceneLayer.current?.setIncidents(incidents);
  }, [incidents]);

  useEffect(() => {
    const currentMap = map.current;
    const currentMarkers = readyMarkers.current;
    if (!currentMap || !currentMarkers) return;

    const visibleIds = new Set(incidents.map((incident) => incident.id));
    for (const [id, marker] of currentMarkers) {
      if (!visibleIds.has(id)) {
        marker.remove();
        currentMarkers.delete(id);
      }
    }

    for (const incident of incidents) {
      let marker = currentMarkers.get(incident.id);
      if (!marker) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'map-marker';
        element.setAttribute('aria-label', incident.title);
        element.addEventListener('click', (event: MouseEvent) => {
          event.stopPropagation();
          const current = incidentsRef.current.find((item) => item.id === incident.id);
          if (current) callbacks.current.onSelect(current);
        });
        const svgNamespace = 'http://www.w3.org/2000/svg';
        const pin = document.createElementNS(svgNamespace, 'svg');
        pin.setAttribute('viewBox', '0 0 40 52');
        pin.setAttribute('aria-hidden', 'true');
        pin.classList.add('map-marker-shape');
        const shape = document.createElementNS(svgNamespace, 'path');
        shape.setAttribute(
          'd',
          'M20 52C17 47 2 31 2 20a18 18 0 1 1 36 0c0 11-15 27-18 32Z',
        );
        shape.setAttribute('stroke', 'white');
        shape.setAttribute('stroke-width', '3');
        pin.append(shape);
        const visual = document.createElement('span');
        visual.className = 'map-marker-visual';
        const icon = document.createElement('span');
        icon.className = 'map-marker-icon';
        icon.setAttribute('aria-hidden', 'true');
        visual.append(pin, icon);
        element.append(visual);
        marker = new maplibregl.Marker({
          element,
          anchor: 'bottom',
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport',
        })
          .setLngLat([incident.longitude, incident.latitude])
          .addTo(currentMap);
        currentMarkers.set(incident.id, marker);
      } else {
        marker.setLngLat([incident.longitude, incident.latitude]);
      }
      marker.setOffset(
        currentMap.getZoom() >= MODEL_ZOOM_THRESHOLD ? [0, -12] : [0, 0],
      );

      const element = marker.getElement();
      const icon = element.querySelector('.map-marker-icon');
      for (const { value } of categoryOptions) {
        element.classList.toggle(
          value.toLowerCase(),
          value === incident.category,
        );
      }
      element.classList.add('map-marker');
      element.classList.toggle('active', selectedId === incident.id);
      element.setAttribute('aria-label', incident.title);
      element.title = `${incident.title} · ${incidentCategoryLabels[incident.category]}`;
      if (icon) {
        icon.textContent = categoryOptions.find(({ value }) => value === incident.category)?.icon
          ?? '!';
      }
    }
  }, [incidents, selectedId]);

  useEffect(() => {
    sceneLayer.current?.setPreview(
      placing,
      draftCoordinates ? [draftCoordinates.lng, draftCoordinates.lat] : null,
    );
    if (map.current) {
      map.current.getCanvas().style.cursor = placing ? 'crosshair' : '';
    }
  }, [placing, draftCoordinates]);

  useEffect(() => {
    if (focus && map.current) {
      // The details panel changes the container width in the same React commit.
      // Resize before flyTo calculates its target screen position.
      map.current.resize();
      map.current.flyTo({
        center: [focus.lng, focus.lat],
        zoom: focus.zoom ?? 19.8,
        offset: [0, window.innerWidth <= 620 ? -map.current.getCanvas().clientHeight * .12 : 0],
        pitch: is3dRef.current ? INITIAL_PITCH : 0,
        duration: 1200,
      });
    }
  }, [focus, mapReady]);

  function setView3d(enabled: boolean) {
    setIs3d(enabled);
    sceneLayer.current?.setEnabled(enabled);
    for (const layer of map.current?.getStyle().layers ?? []) {
      if (layer.type === 'symbol') map.current?.setLayoutProperty(layer.id, 'visibility', enabled && (map.current?.getZoom() ?? 0) >= MODEL_ZOOM_THRESHOLD ? 'none' : 'visible');
    }
    if (!enabled) sceneLayer.current?.setPreview(null, null);
    map.current?.easeTo({
      pitch: enabled ? INITIAL_PITCH : 0,
      bearing: enabled ? -28 : 0,
    });
    if (map.current?.getLayer(buildingLayerId)) {
      map.current.setLayoutProperty(
        buildingLayerId,
        'visibility',
        enabled ? 'visible' : 'none',
      );
    }
  }

  function movePaletteFocus(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    const count = categoryOptions.length + 1;
    let target: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      target = (index + 1) % count;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      target = (index - 1 + count) % count;
    } else if (event.key === 'Home') {
      target = 0;
    } else if (event.key === 'End') {
      target = count - 1;
    }
    if (target !== null) {
      event.preventDefault();
      paletteButtons.current[target]?.focus();
    }
  }

  const goHome = () => {
    map.current?.flyTo({
      center: CENTER,
      zoom: INITIAL_ZOOM,
      pitch: is3d ? INITIAL_PITCH : 0,
      bearing: is3d ? -28 : 0,
    });
  };

  return (
    <div className={`map-wrap ${placing ? 'is-placing' : ''}`}>
      <div className="city-heading">
        <span className="city-kicker"><i /> CIDADE VIVA <span>MAPA REAL</span></span>
        <h1>Seu bairro em movimento.</h1>
        <p className="street-location" title={centerCoordinates}><LocateFixed size={13}/><span>{streetLocation}</span></p><small className="map-coordinate-label">Centro do mapa · {centerCoordinates || 'carregando'}</small>
        <div className="city-indicators"><span><i /> {incidents.length} ocorrências visíveis</span><span>{paused ? 'Simulação pausada' : 'A cidade reage a você'}</span></div>
      </div>
      {!mapReady && !mapError && <div className="city-map-message" role="status">Construindo sua cidade…</div>}
      {mapError && !mapReady && <div className="city-map-message" role="alert">Não foi possível carregar o mapa. Verifique sua conexão.<button onClick={() => { setMapError(false); map.current?.setStyle('https://tiles.openfreemap.org/styles/liberty'); }}>Tentar novamente</button></div>}
      <div
        ref={element}
        className="map-canvas"
        role="region"
        aria-label="Mapa interativo de ocorrências"
      />
      <div className="view-toggle" aria-label="Modo de visualização">
        <button
          type="button"
          className={is3d ? 'active' : ''}
          aria-pressed={is3d}
          onClick={() => setView3d(true)}
        >
          Cidade 3D
        </button>
        <button
          type="button"
          className={!is3d ? 'active' : ''}
          aria-pressed={!is3d}
          onClick={() => setView3d(false)}
        >
          Mapa 2D
        </button>
      </div>
      <div className="city-playback">
        <button type="button" aria-label={paused ? 'Retomar simulação' : 'Pausar simulação'} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
        <button type="button" aria-label="Girar cidade" onClick={() => { const current = map.current; if (current) current.easeTo({ bearing: current.getBearing() + 45 }); }}><RotateCcw size={16} /></button>
      </div>
      <div
        className="map-insert-palette"
        role="group"
        aria-label="Selecione o objeto ou categoria para posicionar no mapa"
      >
        <button
          ref={(button) => { paletteButtons.current[0] = button; }}
          type="button"
          aria-pressed={placing === null}
          onClick={() => onSetPlacing(null)}
          onKeyDown={(event) => movePaletteFocus(0, event)}
        >
          <Navigation size={16} /> Explorar
        </button>
        {categoryOptions.map(({ value, icon }, index) => (
          <button
            key={value}
            ref={(button) => { paletteButtons.current[index + 1] = button; }}
            type="button"
            aria-pressed={placing === value}
            aria-label={`Posicionar: ${incidentCategoryLabels[value]}`}
            onClick={() => onSetPlacing(placing === value ? null : value)}
            onKeyDown={(event) => movePaletteFocus(index + 1, event)}
          >
            <span aria-hidden="true">{icon}</span>
            {{ STREETLIGHT: 'Iluminação', POTHOLE: 'Buraco', FLOOD: 'Alagamento', SAFETY: 'Segurança', TRAFFIC: 'Trânsito' }[value]}
          </button>
        ))}
      </div>
      <details className="map-object-index">
        <summary>Ocorrências no mapa ({incidents.length})</summary>
        <ul>
          {incidents.map((incident) => (
            <li key={incident.id}>
              <button
                type="button"
                aria-current={selectedId === incident.id ? 'true' : undefined}
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open');
                  onSelect(incident);
                }}
              >
                <span>{incident.title}</span>
                <small>{incidentCategoryLabels[incident.category]}</small>
              </button>
            </li>
          ))}
          {incidents.length === 0 && <li className="map-object-index-empty">Nenhuma ocorrência visível.</li>}
        </ul>
      </details>
      <div className="map-controls">
        <button type="button" onClick={() => map.current?.zoomIn()} aria-label="Ampliar"><Plus /></button>
        <button type="button" onClick={() => map.current?.zoomOut()} aria-label="Reduzir"><Minus /></button>
      </div>
      <button type="button" className="locate" onClick={goHome} aria-label="Voltar à área inicial">
        <LocateFixed />
      </button>
      {placing && (
        <div className="place-hint" role="status">
          <Crosshair />
          <div>
            <b>Posicione: {incidentCategoryLabels[placing]}</b>
            <span>Clique na rua para posicionar. Depois, publique seu relato.</span>
          </div>
        </div>
      )}
      {is3d && zoomLevel < MODEL_ZOOM_THRESHOLD && <div className="city-zoom-hint">Aproxime o mapa para explorar a cidade viva.</div>}
      <span className="demo-label">Ocorrências demonstrativas · Modelos KayKit / CC0</span>
    </div>
  );
}
