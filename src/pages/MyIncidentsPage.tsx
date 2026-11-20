import { Ban, Eye, Pencil, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stats } from '../components/dashboard/Stats';
import { StatusBadge } from '../components/incidents/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useIncidents } from '../context/IncidentsContext';
import { incidentCategoryLabels } from '../types';
import type {
  Incident,
  IncidentCategory,
  IncidentStatus,
  IncidentUpdateInput,
} from '../types';

type CategoryFilter = 'ALL' | IncidentCategory;
type StatusFilter = 'ALL' | IncidentStatus;

const initialDraft: IncidentUpdateInput = {
  category: 'STREETLIGHT',
  title: '',
  description: '',
};

function categoryName(category: IncidentCategory) {
  return incidentCategoryLabels[category];
}

export function MyIncidentsPage() {
  const {
    incidents,
    loading,
    error,
    refreshing,
    refresh,
    updateOwnPending,
    cancelOwnPending,
  } = useIncidents();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [editing, setEditing] = useState<Incident | null>(null);
  const [draft, setDraft] = useState<IncidentUpdateInput>(initialDraft);
  const [cancelTarget, setCancelTarget] = useState<Incident | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const mine = useMemo(
    () => incidents.filter((incident) => incident.userId === user?.id),
    [incidents, user?.id],
  );
  const list = useMemo(
    () => mine.filter((incident) => (
      (status === 'ALL' || incident.status === status)
      && (category === 'ALL' || incident.category === category)
    )),
    [mine, status, category],
  );

  function startEditing(incident: Incident) {
    if (incident.status !== 'PENDING') return;
    setActionError('');
    setActionMessage('');
    setDraft({
      category: incident.category,
      title: incident.title,
      description: incident.description,
    });
    setEditing(incident);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const title = draft.title.trim();
    const description = draft.description.trim();
    if (!title || !description) {
      setActionError('Preencha o título e a descrição da ocorrência.');
      return;
    }

    setSaving(true);
    setActionError('');
    try {
      await updateOwnPending(editing.id, { ...draft, title, description });
      setEditing(null);
      setActionMessage('Ocorrência atualizada com sucesso.');
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'Não foi possível editar a ocorrência.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancellation() {
    if (!cancelTarget) return;
    setSaving(true);
    setActionError('');
    try {
      await cancelOwnPending(cancelTarget.id);
      setCancelTarget(null);
      setActionMessage('Ocorrência cancelada. O registro e o histórico foram preservados.');
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'Não foi possível cancelar a ocorrência.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ÁREA DO CIDADÃO</span>
          <h1>Minhas ocorrências</h1>
          <p>Acompanhe e gerencie os problemas que você registrou na cidade.</p>
        </div>
        <button className="primary compact" onClick={() => navigate('/map')}>
          + Nova ocorrência
        </button>
      </div>

      <Stats items={mine} />

      {actionMessage && <p className="incident-action-success" role="status">{actionMessage}</p>}
      {actionError && !editing && !cancelTarget && (
        <p className="incident-action-error" role="alert">{actionError}</p>
      )}

      <section className="content-card">
        <div className="table-tools">
          <div>
            <h2>Seus registros</h2>
            <span>{list.length} ocorrência(s) encontrada(s)</span>
          </div>
          <div className="filters">
            <SlidersHorizontal aria-hidden="true" />
            <label>
              <span className="sr-only">Filtrar por categoria</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as CategoryFilter)}
              >
                <option value="ALL">Todas as categorias</option>
                <option value="STREETLIGHT">Poste apagado</option>
                <option value="POTHOLE">Buraco na rua</option>
                <option value="FLOOD">Rua alagada</option>
                <option value="SAFETY">Ocorrência de segurança</option>
                <option value="TRAFFIC">Trânsito intenso</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filtrar por status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
              >
                <option value="ALL">Todos os status</option>
                <option value="PENDING">Pendente</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
            </label>
          </div>
        </div>

        {error && (
          <div className="admin-load-error" role="alert">
            <span>{error}</span>
            <button disabled={refreshing} onClick={() => void refresh()}>
              {refreshing ? 'Tentando...' : 'Tentar novamente'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="empty">Carregando ocorrências...</div>
        ) : list.length === 0 ? (
          <div className="empty">Nenhuma ocorrência corresponde aos filtros.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ocorrência</th>
                  <th>Categoria</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <small>{incident.id}</small>
                      <b>{incident.title}</b>
                    </td>
                    <td>{categoryName(incident.category)}</td>
                    <td>{new Date(incident.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td><StatusBadge status={incident.status} /></td>
                    <td className="incident-actions">
                      <button
                        className="table-action"
                        onClick={() => navigate('/map', { state: { incidentId: incident.id } })}
                        aria-label={`Ver ${incident.title} no mapa`}
                      >
                        <Eye aria-hidden="true" />
                      </button>
                      {incident.status === 'PENDING' && (
                        <>
                          <button
                            className="table-action"
                            onClick={() => startEditing(incident)}
                            aria-label={`Editar ${incident.title}`}
                          >
                            <Pencil aria-hidden="true" />
                          </button>
                          <button
                            className="table-action danger"
                            onClick={() => {
                              setActionError('');
                              setActionMessage('');
                              setCancelTarget(incident);
                            }}
                            aria-label={`Cancelar ${incident.title}`}
                          >
                            <Ban aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <div className="incident-modal-backdrop">
          <section
            className="incident-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-incident-title"
          >
            <div className="incident-modal-heading">
              <div>
                <span className="eyebrow">OCORRÊNCIA PENDENTE</span>
                <h2 id="edit-incident-title">Editar ocorrência</h2>
              </div>
              <button
                className="notification-close"
                type="button"
                aria-label="Fechar edição"
                disabled={saving}
                onClick={() => setEditing(null)}
              >
                <X />
              </button>
            </div>
            <p className="incident-modal-description">
              Você pode editar categoria, título e descrição. A localização e a foto serão mantidas.
            </p>
            <form onSubmit={(event) => void saveEdit(event)}>
              <label>
                Categoria
                <select
                  value={draft.category}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    category: event.target.value as IncidentCategory,
                  }))}
                >
                  <option value="STREETLIGHT">Poste apagado</option>
                  <option value="POTHOLE">Buraco na rua</option>
                  <option value="FLOOD">Rua alagada</option>
                  <option value="SAFETY">Ocorrência de segurança</option>
                <option value="TRAFFIC">Trânsito intenso</option>
                </select>
              </label>
              <label>
                Título
                <input
                  autoFocus
                  maxLength={80}
                  required
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))}
                />
              </label>
              <label>
                Descrição
                <textarea
                  required
                  maxLength={2000}
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))}
                />
              </label>
              {actionError && <p className="incident-action-error" role="alert">{actionError}</p>}
              <div className="incident-modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(null)}
                >
                  Voltar
                </button>
                <button className="primary compact" type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {cancelTarget && (
        <div className="incident-modal-backdrop">
          <section
            className="incident-modal incident-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-incident-title"
            aria-describedby="cancel-incident-description"
          >
            <div className="incident-modal-heading">
              <div>
                <span className="eyebrow">CANCELAR OCORRÊNCIA</span>
                <h2 id="cancel-incident-title">Confirmar cancelamento?</h2>
              </div>
              <button
                className="notification-close"
                type="button"
                aria-label="Fechar confirmação"
                disabled={saving}
                onClick={() => setCancelTarget(null)}
              >
                <X />
              </button>
            </div>
            <p id="cancel-incident-description">
              “{cancelTarget.title}” será marcada como cancelada. O registro e o histórico serão
              preservados, e o ponto deixará de aparecer entre as ocorrências ativas do mapa.
            </p>
            {actionError && <p className="incident-action-error" role="alert">{actionError}</p>}
            <div className="incident-modal-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={saving}
                onClick={() => setCancelTarget(null)}
              >
                Manter ocorrência
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={saving}
                onClick={() => void confirmCancellation()}
              >
                {saving ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
