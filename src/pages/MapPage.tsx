import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IncidentDetails } from '../components/incidents/IncidentDetails';
import { IncidentForm } from '../components/incidents/IncidentForm';
import { CityMap } from '../components/map/CityMap';
import { useIncidents } from '../context/IncidentsContext';
import { useAuth } from '../context/AuthContext';
import { incidentCategoryLabels } from '../types';
import type { Incident, IncidentCategory, IncidentInput, IncidentStatus } from '../types';
import type { AddressResult } from '../services/geocoding';

type MapFocus = { lat: number; lng: number; zoom?: number; label?: string; locality?: string };
export function MapPage() {
  const { incidents, create, updateStatus, loading, error, refresh, refreshing } = useIncidents();
  const { canManageIncidents, profile } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = incidents.find(incident => incident.id === selectedId);
  const [placing, setPlacing] = useState<IncidentCategory | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | IncidentStatus>('ACTIVE');
  const location = useLocation();
  const navigate = useNavigate();
  const queryCategory = new URLSearchParams(location.search).get('category');
  const category = queryCategory && Object.hasOwn(incidentCategoryLabels, queryCategory) ? queryCategory as IncidentCategory : null;
  const activeIncidents = useMemo(() => incidents.filter(incident =>
    (!category || incident.category === category) &&
    (statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? !['CANCELLED', 'RESOLVED'].includes(incident.status) : incident.status === statusFilter))
  ), [incidents, category, statusFilter]);

  useEffect(() => {
    const state = location.state as { incidentId?: string; mapTarget?: AddressResult } | null;
    const incident = state?.incidentId ? incidents.find(item => item.id === state.incidentId) : undefined;
    const target = state?.mapTarget;
    if (!incident && !target) return;
    const timer = window.setTimeout(() => {
      setPlacing(null); setCoords(null);
      if (incident) {
        setSelectedId(incident.id);
        setFocus({ lat: incident.latitude, lng: incident.longitude });
      } else if (target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
        setSelectedId(null); setFocus(target);
      }
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [incidents, location, navigate]);

  const onSelect = useCallback((incident: Incident) => {
    setSelectedId(incident.id); setPlacing(null); setCoords(null);
    setFocus({ lat: incident.latitude, lng: incident.longitude });
  }, []);

  async function submit(input: IncidentInput) {
    const incident = await create(input);
    setSelectedId(incident.id); setPlacing(null); setCoords(null);
    setFocus({ lat: incident.latitude, lng: incident.longitude });
  }

  return <div className="map-page">
    <div className="map-stage">
      {loading && <div className="loading">Carregando mapa urbano...</div>}
      {error && <div className="error-banner"><span>{error}</span><button disabled={refreshing} onClick={()=>void refresh()}>{refreshing?'Tentando...':'Tentar novamente'}</button></div>}
      <CityMap incidents={activeIncidents} selectedId={selected?.id} placing={placing} onSelect={onSelect} onPlace={setCoords} onSetPlacing={(value)=>{setPlacing(value);setSelectedId(null);setCoords(null)}} focus={focus} draftCoordinates={coords}/>
      {!placing && <div className="map-filter-bar">
        {canManageIncidents && <span className="public-mode" title={`${profile?.organizationName || 'Administração'} · ${profile?.publicPosition || 'Administrador'}`}>Atendimento público <small>{profile?.organizationName || 'Administração'} · {profile?.publicPosition || 'Administrador'}</small></span>}
        <label>Status das ocorrências<select aria-label="Filtrar por status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="ACTIVE">Ativas</option><option value="PENDING">Pendentes</option><option value="IN_PROGRESS">Em andamento</option><option value="RESOLVED">Resolvidas</option><option value="CANCELLED">Canceladas</option><option value="ALL">Todas</option>
        </select></label>
        {category && <button type="button" onClick={() => navigate('/map')}>{incidentCategoryLabels[category]}<X size={13}/><span className="sr-only">Limpar filtro</span></button>}
      </div>}
      {!placing && <button className="register" onClick={()=>{setPlacing('STREETLIGHT');setSelectedId(null);setCoords(null)}}><Plus/> Registrar ocorrência</button>}
      {placing && <IncidentForm category={placing} onCategoryChange={setPlacing} coords={coords} onCancel={()=>{setPlacing(null);setCoords(null)}} onSubmit={submit}/>}
    </div>
    {selected && <IncidentDetails key={selected.id} incident={selected} onClose={()=>setSelectedId(null)} onMap={()=>setFocus({lat:selected.latitude,lng:selected.longitude})}
      onUpdateStatus={canManageIncidents ? status => updateStatus(selected.id, status) : undefined}
      attendant={profile?.organizationName ? `${profile.organizationName} · ${profile.publicPosition}` : 'Administração'}/>}
  </div>;
}
