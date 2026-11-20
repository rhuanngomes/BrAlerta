import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Stats } from '../components/dashboard/Stats';
import { StatusBadge, statusLabel } from '../components/incidents/StatusBadge';
import { useIncidents } from '../context/IncidentsContext';
import { incidentCategoryLabels } from '../types';
import type { Incident, IncidentCategory, IncidentStatus } from '../types';

type CategoryFilter = 'ALL' | IncidentCategory;
type StatusFilter = 'ALL' | IncidentStatus;

const statusOptions: IncidentStatus[] = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];

function parseStatus(value: string): IncidentStatus | null {
  switch (value) {
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'RESOLVED':
    case 'CANCELLED':
      return value;
    default:
      return null;
  }
}

function parseStatusFilter(value: string): StatusFilter | null {
  return value === 'ALL' ? 'ALL' : parseStatus(value);
}

function parseCategoryFilter(value: string): CategoryFilter | null {
  switch (value) {
    case 'ALL':
    case 'STREETLIGHT':
    case 'POTHOLE':
    case 'FLOOD':
    case 'SAFETY':
    case 'TRAFFIC':
      return value;
    default:
      return null;
  }
}

function categoryName(category: IncidentCategory) {
  return incidentCategoryLabels[category];
}

function incidentLocation(incident: Incident) {
  return incident.address ||
    `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminPage() {
  const {
    incidents,
    loading,
    error: incidentsError,
    refresh,
    refreshing,
    updateStatus,
  } = useIncidents();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const selected = incidents.find((item) => item.id === selectedId) ?? null;

  const list = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return incidents.filter((item) => {
      const matchesQuery = `${item.title} ${item.id}`
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedQuery);
      return matchesQuery
        && (categoryFilter === 'ALL' || item.category === categoryFilter)
        && (statusFilter === 'ALL' || item.status === statusFilter);
    });
  }, [categoryFilter, incidents, query, statusFilter]);

  async function change(status: IncidentStatus) {
    if (!selected || saving || selected.status === status) return;

    setSaving(true);
    setUpdateError('');
    try {
      await updateStatus(selected.id, status);
    } catch (cause) {
      setUpdateError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar o status.',
      );
    } finally {
      setSaving(false);
    }
  }

  function selectIncident(incident: Incident) {
    setSelectedId(incident.id);
    setUpdateError('');
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTÃO DE OCORRÊNCIAS</span>
          <h1>Painel administrativo</h1>
          <p>Área protegida para triagem e acompanhamento das ocorrências.</p>
        </div>
        <span className="role-pill">Perfil: Administrador</span>
      </div>

      <Stats items={incidents} />

      {incidentsError && (
        <div className="admin-load-error" role="alert">
          <span>{incidentsError}</span>
          <button disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? 'Tentando...' : 'Tentar novamente'}
          </button>
        </div>
      )}

      <section className="content-card">
        <div className="table-tools admin-table-tools">
          <div>
            <h2>Gestão de ocorrências</h2>
            <span>Selecione um registro para visualizar e atualizar</span>
          </div>
          <div className="admin-controls">
            <label className="admin-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Buscar ocorrência</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por título ou ID"
              />
            </label>
            <label className="admin-filter">
              <span className="sr-only">Filtrar por categoria</span>
              <select
                value={categoryFilter}
                onChange={(event) => {
                  const filter = parseCategoryFilter(event.target.value);
                  if (filter) setCategoryFilter(filter);
                }}
              >
                <option value="ALL">Todas as categorias</option>
                <option value="STREETLIGHT">Poste apagado</option>
                <option value="POTHOLE">Buraco na rua</option>
                <option value="FLOOD">Rua alagada</option>
                <option value="SAFETY">Ocorrência de segurança</option>
                <option value="TRAFFIC">Trânsito intenso</option>
              </select>
            </label>
            <label className="admin-filter">
              <span className="sr-only">Filtrar por status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  const filter = parseStatusFilter(event.target.value);
                  if (filter) setStatusFilter(filter);
                }}
              >
                <option value="ALL">Todos os status</option>
                {statusOptions.map((status) => (
                  <option value={status} key={status}>{statusLabel[status]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="admin-layout">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID / Título</th>
                  <th>Categoria</th>
                  <th>Status</th>
                  <th>Localização</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="admin-table-message" colSpan={4}>Carregando ocorrências...</td></tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td className="admin-table-message" colSpan={4}>
                      Nenhuma ocorrência encontrada com esses filtros.
                    </td>
                  </tr>
                ) : list.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    aria-selected={selected?.id === item.id}
                    onClick={() => selectIncident(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectIncident(item);
                      }
                    }}
                    className={selected?.id === item.id ? 'row-selected' : ''}
                  >
                    <td><small>{item.id}</small><b>{item.title}</b></td>
                    <td>{categoryName(item.category)}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{incidentLocation(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="admin-detail" aria-live="polite">
            {selected ? (
              <>
                <span className="eyebrow">DETALHES DA OCORRÊNCIA</span>
                <h3>{selected.title}</h3>
                <p>{selected.description}</p>
                {selected.photoUrl && (
                  <img
                    className="admin-detail-photo"
                    src={selected.photoUrl}
                    alt={`Foto da ocorrência: ${selected.title}`}
                  />
                )}
                <dl className="admin-detail-facts">
                  <div><dt>ID</dt><dd>{selected.id}</dd></div>
                  <div><dt>Categoria</dt><dd>{categoryName(selected.category)}</dd></div>
                  <div><dt>Localização</dt><dd>{incidentLocation(selected)}</dd></div>
                  <div><dt>Registrada em</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
                </dl>
                <label className="admin-status-label">
                  Atualizar status
                  <select
                    aria-label="Atualizar status da ocorrência"
                    value={selected.status}
                    disabled={saving}
                    onChange={(event) => {
                      const status = parseStatus(event.target.value);
                      if (status) void change(status);
                    }}
                  >
                    {statusOptions.map((status) => (
                      <option value={status} key={status}>{statusLabel[status]}</option>
                    ))}
                  </select>
                </label>
                {saving && <div className="saving-state" role="status">Salvando alteração...</div>}
                {updateError && <div className="auth-error" role="alert">{updateError}</div>}
                <h4>Histórico</h4>
                {selected.history.length > 0 ? (
                  <ul className="admin-history">
                    {[...selected.history].reverse().map((entry) => (
                      <li key={entry.id}>
                        <b>
                          {entry.eventType === 'DETAILS_UPDATED'
                            ? 'Ocorrência editada'
                            : entry.eventType === 'CANCELLED' || entry.newStatus === 'CANCELLED'
                              ? 'Ocorrência cancelada'
                              : entry.previousStatus
                                ? statusLabel[entry.newStatus]
                                : 'Ocorrência registrada'}
                        </b>
                        <span>{formatDateTime(entry.changedAt)} · {entry.changedBy}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-no-history">Nenhuma atualização de status registrada.</p>
                )}
                <div className="admin-note">A mudança é registrada no histórico da ocorrência.</div>
              </>
            ) : (
              <div className="empty">Selecione uma ocorrência na tabela.</div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
