import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type {
  ExpressionSpecification,
  FillExtrusionLayerSpecification,
  Map as MapInstance,
  MapMouseEvent,
  Marker,
} from 'maplibre-gl';
import { Crosshair, Layers3, LocateFixed, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { visualDaCategoria } from '../../design/assets';
import type { Incident, IncidentCategory } from '../../types';
import { incidentCategoryLabels } from '../../types';
import type { ThreeSceneLayer as ThreeSceneLayerType } from './ThreeSceneLayer';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const CENTER: [number, number] = [-43.465, -23.025];
const INITIAL_PITCH = 60;
const MODEL_ZOOM_THRESHOLD = 15.5;
const buildingLayerId = '3d-buildings';
const sceneLayerId = 'three-scene';

const categoryOptions: Array<{ value: IncidentCategory; icon: string }> = [
  { value: 'STREETLIGHT', icon: '💡' },
  { value: 'POTHOLE', icon: '⚠️' },
  { value: 'FLOOD', icon: '🌊' },
  { value: 'SAFETY', icon: '🛡️' },
];

type Coordinates = { lat: number; lng: number };

type CityMapProps = {
  incidents: Incident[];
  selectedId?: string;
  placing?: IncidentCategory | null;
  onSelect: (incident: Incident) => void;
  onPlace: (coordinates: Coordinates) => void;
  onSetPlacing: (category: IncidentCategory | null) => void;
  focus?: Coordinates | null;
};

function createBuildingLayer(): FillExtrusionLayerSpecification {
  return {
    id: buildingLayerId,
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': '#aebfc6',
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
}: CityMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const sceneLayer = useRef<ThreeSceneLayerType | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const readyMarkers = useRef<Map<string, Marker> | null>(null);
  const incidentsRef = useRef(incidents);
  const callbacks = useRef({ onSelect, onPlace, onSetPlacing });
  const placingRef = useRef(placing);
  const paletteButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const [is3d, setIs3d] = useState(true);
  const is3dRef = useRef(is3d);

  useEffect(() => {
    incidentsRef.current = incidents;
    callbacks.current = { onSelect, onPlace, onSetPlacing };
    placingRef.current = placing;
    is3dRef.current = is3d;
  }, [incidents, is3d, onPlace, onSelect, onSetPlacing, placing]);

  useEffect(() => {
    if (!element.current) return;

    let disposed = false;
    const mapMarkers = markers.current;
    readyMarkers.current = mapMarkers;
    const instance = new maplibregl.Map({
      container: element.current,
      center: CENTER,
      zoom: 16,
      pitch: INITIAL_PITCH,
      bearing: -15,
      style: 'https://tiles.openfreemap.org/styles/liberty',
    });
    map.current = instance;

    const ensureLayers = () => {
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
    };

    const updateZoomState = () => {
      const zoom = instance.getZoom();
      sceneLayer.current?.setZoom(zoom);
      const offset: [number, number] = zoom >= MODEL_ZOOM_THRESHOLD ? [0, -36] : [0, 0];
      for (const marker of mapMarkers.values()) marker.setOffset(offset);
    };

    const handleClick = (event: MapMouseEvent) => {
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

      const category = placingRef.current;
      if (category) {
        callbacks.current.onPlace({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
      }
    };

    const handleMove = (event: MapMouseEvent) => {
      const category = placingRef.current;
      sceneLayer.current?.setPreview(
        category,
        category && is3dRef.current && instance.getZoom() >= MODEL_ZOOM_THRESHOLD
          ? [event.lngLat.lng, event.lngLat.lat]
          : null,
      );
    };

    instance.on('style.load', ensureLayers);
    instance.on('zoom', updateZoomState);
    instance.on('click', handleClick);
    instance.on('mousemove', handleMove);

    return () => {
      disposed = true;
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
        const officialMarker = document.createElement('img');
        officialMarker.className = 'map-marker-image';
        officialMarker.alt = '';
        officialMarker.width = 40;
        officialMarker.height = 52;
        const icon = document.createElement('span');
        icon.className = 'map-marker-icon';
        icon.setAttribute('aria-hidden', 'true');
        visual.append(pin, icon);
        element.append(visual, officialMarker);
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
        currentMap.getZoom() >= MODEL_ZOOM_THRESHOLD ? [0, -36] : [0, 0],
      );

      const element = marker.getElement();
      const icon = element.querySelector('.map-marker-icon');
      const officialMarker = element.querySelector<HTMLImageElement>('.map-marker-image');
      const categoryVisual = visualDaCategoria(incident.category);
      for (const { value } of categoryOptions) {
        element.classList.toggle(
          value.toLowerCase(),
          value === incident.category,
        );
      }
      element.classList.add('map-marker');
      element.classList.toggle('has-official-marker', Boolean(categoryVisual));
      element.classList.toggle('active', selectedId === incident.id);
      element.setAttribute('aria-label', incident.title);
      element.title = `${incident.title} · ${incidentCategoryLabels[incident.category]}`;
      if (icon) {
        icon.textContent = categoryOptions.find(({ value }) => value === incident.category)?.icon
          ?? '!';
      }
      if (officialMarker && categoryVisual) officialMarker.src = categoryVisual.marcador;
    }
  }, [incidents, selectedId]);

  useEffect(() => {
    sceneLayer.current?.setPreview(
      placing,
      null,
    );
    if (map.current) {
      map.current.getCanvas().style.cursor = placing ? 'crosshair' : '';
    }
  }, [placing]);

  useEffect(() => {
    if (focus) {
      map.current?.flyTo({
        center: [focus.lng, focus.lat],
        zoom: 17,
        pitch: is3d ? INITIAL_PITCH : 0,
        duration: 1200,
      });
    }
  }, [focus, is3d]);

  function setView3d(enabled: boolean) {
    setIs3d(enabled);
    if (!enabled) sceneLayer.current?.setPreview(null, null);
    map.current?.easeTo({
      pitch: enabled ? INITIAL_PITCH : 0,
      bearing: enabled ? -15 : 0,
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
      zoom: 16,
      pitch: is3d ? INITIAL_PITCH : 0,
      bearing: is3d ? -15 : 0,
    });
  };

  return (
    <div className="map-wrap">
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
          Mapa 3D
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
      <div className="layers" aria-hidden="true"><Layers3 /></div>
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
          Navegar
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
            {incidentCategoryLabels[value]}
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
                onClick={() => onSelect(incident)}
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
            <span>Passe o cursor para pré-visualizar e clique no local</span>
          </div>
        </div>
      )}
      <span className="demo-label">Dados de ocorrências demonstrativos</span>
    </div>
  );
}
