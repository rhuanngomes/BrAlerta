import {
  Car,
  Bell,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  Info,
  Lightbulb,
  LogIn,
  ListChecks,
  Map,
  MapPin,
  Menu,
  ShieldCheck,
  ShieldAlert,
  TriangleAlert,
  Waves,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentsContext';
import { AddressSearch } from './AddressSearch';
import { statusLabel } from '../incidents/StatusBadge';
import { incidentCategoryLabels } from '../../types';
import type { Incident, IncidentCategory } from '../../types';

import { MARCA } from '../../design/assets';
type SystemNotification = {
  id: string;
  incidentId: string;
  title: string;
  message: string;
  createdAt: string;
};

function categoryName(category: IncidentCategory) {
  return incidentCategoryLabels[category];
}

function notificationsFor(incidents: Incident[]): SystemNotification[] {
  return incidents.flatMap((incident) => [
    {
      id: `${incident.id}-created`,
      incidentId: incident.id,
      title: 'Nova ocorrência registrada',
      message: `${categoryName(incident.category)} · ${incident.title}`,
      createdAt: incident.createdAt,
    },
    ...incident.history.flatMap((entry) => {
      const eventType = entry.eventType
        ?? (entry.previousStatus ? 'STATUS_UPDATED' : 'CREATED');
      if (eventType === 'CREATED') return [];
      if (eventType === 'DETAILS_UPDATED') {
        return [{
          id: entry.id,
          incidentId: incident.id,
          title: 'Ocorrência editada',
          message: `${incident.title} · Categoria, título ou descrição atualizados`,
          createdAt: entry.changedAt,
        }];
      }
      if (eventType === 'CANCELLED') {
        return [{
          id: entry.id,
          incidentId: incident.id,
          title: 'Ocorrência cancelada',
          message: incident.title,
          createdAt: entry.changedAt,
        }];
      }
      if (!entry.previousStatus) return [];
      return [{
        id: entry.id,
        incidentId: incident.id,
        title: 'Ocorrência atualizada',
        message: `${incident.title} · ${statusLabel[entry.previousStatus]} → ${statusLabel[entry.newStatus]}`,
        createdAt: entry.changedAt,
      }];
    }),
  ]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const nav = [
  ['/map', 'Mapa', Map],
  ['/my-incidents', 'Minhas ocorrências', ListChecks],
  ['/admin', 'Painel administrativo', ShieldCheck],
  ['/about', 'Sobre o projeto', Info],
] as const;

export function AppShell() {
  const location = useLocation();
  const categoryFilter = new URLSearchParams(location.search).get('category');
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [open, setOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationActionError, setNotificationActionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { profile, isAdmin, signOut } = useAuth();
  const {
    incidents,
    loading,
    refreshing,
    error,
    refresh,
    readNotificationIds,
    notificationReadsLoading,
    notificationReadError,
    refreshNotificationReads,
    markNotificationRead,
    markAllNotificationsRead,
  } = useIncidents();
  const notifications = useMemo(() => notificationsFor(incidents), [incidents]);
  const unreadIds = notifications
    .filter((notification) => !readNotificationIds.includes(notification.id))
    .map((notification) => notification.id);
  const visibleNav = nav.filter(([to]) => to !== '/admin' || isAdmin);
  const fullName = profile?.fullName ?? profile?.email ?? 'Usuário';
  const initials = fullName
    .split(' ')
    .slice(0, 2)
    .map((value) => value[0])
    .join('')
    .toUpperCase();

  async function logout() {
    setProfileMenuOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  }

  function toggleNotifications() {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen) {
      setNotificationActionError(null);
      void refresh();
      void refreshNotificationReads();
    }
  }

  async function markAsRead(notificationId: string) {
    setNotificationActionError(null);
    try {
      await markNotificationRead(notificationId);
    } catch (cause) {
      setNotificationActionError(
        cause instanceof Error ? cause.message : 'Não foi possível marcar como lida.',
      );
    }
  }

  async function markAllAsRead() {
    setNotificationActionError(null);
    try {
      await markAllNotificationsRead(unreadIds);
    } catch (cause) {
      setNotificationActionError(
        cause instanceof Error ? cause.message : 'Não foi possível marcar como lidas.',
      );
    }
  }

  async function openNotification(notification: SystemNotification) {
    if (!readNotificationIds.includes(notification.id)) {
      setNotificationActionError(null);
      try {
        await markNotificationRead(notification.id);
      } catch (cause) {
        setNotificationActionError(
          cause instanceof Error ? cause.message : 'Não foi possível marcar como lida.',
        );
        return;
      }
    }
    setNotificationsOpen(false);
    navigate('/map', { state: { incidentId: notification.incidentId } });
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src={MARCA.logoBranco} alt="BR ALERTA" />
          <button
            className="icon mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X />
          </button>
        </div>
        <p className="tagline">Cidades mais seguras, juntas.</p>

        <nav className="primary-nav" aria-label="Navegação principal">
          {visibleNav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="category-nav">
          <button type="button" className="category-heading" aria-expanded={categoriesOpen} aria-controls="category-filters" onClick={() => setCategoriesOpen(!categoriesOpen)}>
            <Building2 size={16}/><span>Categorias</span><ChevronDown size={15}/>
          </button>
          {categoriesOpen && <div className="category-items" id="category-filters" aria-label="Filtrar ocorrências por categoria">
            {([
              ['', 'Todas as categorias', Map],
              ['STREETLIGHT', 'Poste apagado', Lightbulb],
              ['POTHOLE', 'Buraco na rua', TriangleAlert],
              ['FLOOD', 'Rua alagada', Waves],
              ['SAFETY', 'Ocorrência de segurança', ShieldAlert],
              ['TRAFFIC', 'Trânsito intenso', Car],
            ] as const).map(([category, label, Icon]) => <button type="button" key={category}
              aria-pressed={location.pathname === '/map' && (categoryFilter || '') === category}
              onClick={() => { navigate(category && categoryFilter !== category ? `/map?category=${category}` : '/map'); setOpen(false); }}>
              <Icon size={17}/><span>{label}</span>
            </button>)}
          </div>}
        </div>

        <div className="city">
          <span className="city-thumbnail" aria-hidden="true">🌆</span>
          <span><b>Rio de Janeiro</b><small>Recreio dos Bandeirantes</small></span>
          <ChevronDown size={15} />
        </div>
      </aside>

      <div className="workspace">
        <header>
          <button
            className="icon mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </button>
          <button className="mobile-brand" onClick={() => navigate('/map')} aria-label="BR ALERTA, ir para o mapa">
            <img src={MARCA.logo} alt="" />
          </button>
          <AddressSearch/>
          <div className="notification-area">
            <button
              className="icon notification-button"
              type="button"
              aria-label="Notificações"
              aria-expanded={notificationsOpen}
              aria-controls="system-notifications"
              aria-haspopup="dialog"
              onClick={toggleNotifications}
            >
              <Bell size={19} />
              {!notificationReadsLoading && unreadIds.length > 0 && (
                <span className="notification-count" aria-hidden="true">
                  {unreadIds.length > 99 ? '99+' : unreadIds.length}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <section
                className="notification-panel"
                id="system-notifications"
                role="dialog"
                aria-label="Notificações do sistema"
              >
                <div className="notification-heading">
                  <div>
                    <h2>Notificações</h2>
                    <span>
                      {notifications.length === 0
                        ? 'Nenhuma notificação'
                        : unreadIds.length === 0
                        ? 'Todas as notificações foram lidas'
                        : `${unreadIds.length} ${unreadIds.length === 1 ? 'não lida' : 'não lidas'}`}
                    </span>
                  </div>
                  <div className="notification-heading-actions">
                    {unreadIds.length > 0 && (
                      <button
                        className="notification-mark-all"
                        type="button"
                        onClick={() => void markAllAsRead()}
                        disabled={notificationReadsLoading}
                      >
                        <CheckCheck size={14} />
                        Marcar todas como lidas
                      </button>
                    )}
                    <button
                      className="notification-close"
                      type="button"
                      aria-label="Fechar notificações"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>
                {(notificationReadError || notificationActionError) && (
                  <p className="notification-refresh-error" role="alert">
                    {notificationActionError ?? notificationReadError}
                    {notificationReadError && (
                      <button
                        type="button"
                        onClick={() => void refreshNotificationReads()}
                      >
                        Tentar novamente
                      </button>
                    )}
                  </p>
                )}
                {loading || notificationReadsLoading ? (
                  <p className="notification-state">Carregando notificações...</p>
                ) : error && notifications.length === 0 ? (
                  <div className="notification-state" role="alert">
                    <p>{error}</p>
                    <button type="button" onClick={() => void refresh()}>
                      Tentar novamente
                    </button>
                  </div>
                ) : notifications.length === 0 ? (
                  <p className="notification-state">
                    Não há nenhuma notificação no momento.
                  </p>
                ) : (
                  <>
                    {error && (
                      <p className="notification-refresh-error" role="alert">
                        Não foi possível atualizar as notificações.
                        <button type="button" onClick={() => void refresh()}>
                          Tentar novamente
                        </button>
                      </p>
                    )}
                    {refreshing && (
                      <p className="notification-refreshing">Atualizando...</p>
                    )}
                    <ul className="notification-list">
                      {notifications.map((notification) => (
                          <li
                            className={
                              readNotificationIds.includes(notification.id) ? 'is-read' : ''
                            }
                            key={notification.id}
                          >
                          <button
                              className="notification-open"
                            type="button"
                              onClick={() => void openNotification(notification)}
                          >
                              <span className="notification-mark" aria-hidden="true">
                                {readNotificationIds.includes(notification.id) && (
                                  <Check size={10} />
                                )}
                              </span>
                            <span className="notification-copy">
                              <b>{notification.title}</b>
                              <span>{notification.message}</span>
                              <time dateTime={notification.createdAt}>
                                {formatNotificationDate(notification.createdAt)}
                              </time>
                            </span>
                          </button>
                          {!readNotificationIds.includes(notification.id) && (
                            <button
                              className="notification-mark-read"
                              type="button"
                              aria-label={`Marcar ${notification.title.toLowerCase()} como lida`}
                              onClick={() => void markAsRead(notification.id)}
                              disabled={notificationReadsLoading}
                            >
                              <Check size={15} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
          </div>
          <div className="profile-area">
            <button
              className="profile profile-trigger"
              type="button"
              aria-label={`Abrir menu da conta de ${fullName}`}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              onClick={() => setProfileMenuOpen((current) => !current)}
            >
              <span className="avatar">{initials}</span>
              <span className="profile-copy">
                <b>{fullName}</b>
                <small>{isAdmin ? 'Administrador' : profile?.role === 'PUBLIC_AGENT' ? 'Órgão público' : 'Cidadão'}</small>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {profileMenuOpen && (
              <div className="profile-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void logout()}>
                  <LogIn size={16} aria-hidden="true" />
                  Entrar com outro usuário
                </button>
              </div>
            )}
          </div>
        </header>
        <main><Outlet /></main>
      </div>
    </div>
  );
}
