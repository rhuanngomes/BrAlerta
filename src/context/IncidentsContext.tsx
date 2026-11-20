import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { normalizeIntegrationError } from '../lib/integrationError';
import { isSupabaseEnabled } from '../lib/runtime';
import { getSupabaseClient } from '../lib/supabase';
import { incidentRepository } from '../services/incidents';
import { notificationReadRepository } from '../services/notificationReads';
import type {
  Incident,
  IncidentInput,
  IncidentStatus,
  IncidentUpdateInput,
} from '../types';
import { useAuth } from './AuthContext';

type Context = {
  incidents: Incident[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  readNotificationIds: string[];
  notificationReadsLoading: boolean;
  notificationReadError: string | null;
  refresh: () => Promise<void>;
  refreshNotificationReads: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: (notificationIds: string[]) => Promise<void>;
  create: (input: IncidentInput) => Promise<Incident>;
  updateStatus: (id: string, status: IncidentStatus) => Promise<Incident>;
  updateOwnPending: (id: string, input: IncidentUpdateInput) => Promise<Incident>;
  cancelOwnPending: (id: string) => Promise<Incident>;
};

const C = createContext<Context | null>(null);

export function IncidentsProvider({ children }: { children: React.ReactNode }) {
  const { user, canManageIncidents, loading: authLoading } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationReadState, setNotificationReadState] = useState<{
    userId: string;
    ids: string[];
  } | null>(null);
  const [notificationReadsLoading, setNotificationReadsLoading] = useState(false);
  const [notificationReadError, setNotificationReadError] = useState<string | null>(null);
  const readNotificationIds = useMemo(
    () => notificationReadState && notificationReadState.userId === user?.id
      ? notificationReadState.ids
      : [],
    [notificationReadState, user?.id],
  );
  const creating = useRef(false);
  const updating = useRef(new Set<string>());
  const updatingOwn = useRef(new Set<string>());
  const notificationReadRequest = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) return;

    setRefreshing(true);
    setError(null);
    try {
      setIncidents(await incidentRepository.list());
    } catch (cause) {
      setError(
        normalizeIntegrationError(cause, 'Não foi possível carregar as ocorrências.').message,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const refreshNotificationReads = useCallback(async () => {
    const requestId = ++notificationReadRequest.current;
    if (!user) {
      setNotificationReadError(null);
      setNotificationReadsLoading(false);
      return;
    }

    setNotificationReadsLoading(true);
    setNotificationReadError(null);
    try {
      const readIds = await notificationReadRepository.listReadIds(user.id);
      if (requestId === notificationReadRequest.current) {
        setNotificationReadState({ userId: user.id, ids: readIds });
      }
    } catch (cause) {
      if (requestId === notificationReadRequest.current) {
        setNotificationReadError(
          normalizeIntegrationError(
            cause,
            'Não foi possível carregar o estado das notificações.',
          ).message,
        );
      }
    } finally {
      if (requestId === notificationReadRequest.current) {
        setNotificationReadsLoading(false);
      }
    }
  }, [user]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    if (!user) throw new Error('Entre na plataforma para atualizar as notificações.');
    setNotificationReadError(null);
    try {
      await notificationReadRepository.markRead(user.id, [notificationId]);
      setNotificationReadState((current) => {
        const ids = current?.userId === user.id ? current.ids : [];
        return {
          userId: user.id,
          ids: ids.includes(notificationId) ? ids : [...ids, notificationId],
        };
      });
    } catch (cause) {
      const error = normalizeIntegrationError(
        cause,
        'Não foi possível marcar a notificação como lida.',
      );
      setNotificationReadError(error.message);
      throw error;
    }
  }, [user]);

  const markAllNotificationsRead = useCallback(async (notificationIds: string[]) => {
    if (!user) throw new Error('Entre na plataforma para atualizar as notificações.');
    if (notificationIds.length === 0) return;

    setNotificationReadError(null);
    try {
      await notificationReadRepository.markRead(user.id, notificationIds);
      setNotificationReadState((current) => {
        const ids = current?.userId === user.id ? current.ids : [];
        return { userId: user.id, ids: [...new Set([...ids, ...notificationIds])] };
      });
    } catch (cause) {
      const error = normalizeIntegrationError(
        cause,
        'Não foi possível marcar todas as notificações como lidas.',
      );
      setNotificationReadError(error.message);
      throw error;
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;

    const timer = window.setTimeout(() => {
      if (!user) {
        setIncidents([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      void refresh();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [user, authLoading, refresh]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshNotificationReads();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, authLoading, refreshNotificationReads]);

  useEffect(() => {
    if (!isSupabaseEnabled || !user || import.meta.env.VITE_ENABLE_REALTIME !== 'true') return;

    const client = getSupabaseClient();
    let incidentTimer: number | undefined;
    let readTimer: number | undefined;
    const scheduleIncidents = () => {
      window.clearTimeout(incidentTimer);
      incidentTimer = window.setTimeout(() => void refresh(), 350);
    };
    const scheduleNotificationReads = () => {
      window.clearTimeout(readTimer);
      readTimer = window.setTimeout(() => void refreshNotificationReads(), 350);
    };
    const channel = client
      .channel('br-alerta-incidents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, scheduleIncidents)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incident_history' },
        scheduleIncidents,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_reads',
          filter: `user_id=eq.${user.id}`,
        },
        scheduleNotificationReads,
      )
      .subscribe();

    return () => {
      window.clearTimeout(incidentTimer);
      window.clearTimeout(readTimer);
      void client.removeChannel(channel);
    };
  }, [user, refresh, refreshNotificationReads]);

  const create = useCallback(
    async (input: IncidentInput) => {
      if (!user) {
        throw normalizeIntegrationError(
          new Error('Entre na plataforma para registrar uma ocorrência.'),
        );
      }
      if (creating.current) throw new Error('A ocorrência já está sendo publicada.');

      creating.current = true;
      try {
        const incident = await incidentRepository.create(input, user.id);
        setIncidents((current) => [
          incident,
          ...current.filter((item) => item.id !== incident.id),
        ]);
        return incident;
      } catch (cause) {
        throw normalizeIntegrationError(cause, 'Não foi possível publicar a ocorrência.');
      } finally {
        creating.current = false;
      }
    },
    [user],
  );

  const updateStatus = useCallback(
    async (id: string, status: IncidentStatus) => {
      if (!user || !canManageIncidents) {
        throw normalizeIntegrationError(
          new Error('Somente agentes públicos e administradores podem atualizar o status.'),
        );
      }
      if (updating.current.has(id)) {
        throw new Error('Esta ocorrência já está sendo atualizada.');
      }

      updating.current.add(id);
      try {
        const incident = await incidentRepository.updateStatus(id, status, user.id);
        setIncidents((current) =>
          current.map((item) => (item.id === id ? incident : item)),
        );
        return incident;
      } catch (cause) {
        throw normalizeIntegrationError(cause, 'Não foi possível atualizar o status.');
      } finally {
        updating.current.delete(id);
      }
    },
    [user, canManageIncidents],
  );

  const updateOwnPending = useCallback(
    async (id: string, input: IncidentUpdateInput) => {
      if (!user) {
        throw normalizeIntegrationError(new Error('Entre na plataforma para editar a ocorrência.'));
      }
      if (updatingOwn.current.has(id)) {
        throw new Error('Esta ocorrência já está sendo atualizada.');
      }

      updatingOwn.current.add(id);
      try {
        const incident = await incidentRepository.updateOwnPending(id, input, user.id);
        setIncidents((current) => current.map((item) => item.id === id ? incident : item));
        return incident;
      } catch (cause) {
        throw normalizeIntegrationError(cause, 'Não foi possível editar a ocorrência.');
      } finally {
        updatingOwn.current.delete(id);
      }
    },
    [user],
  );

  const cancelOwnPending = useCallback(
    async (id: string) => {
      if (!user) {
        throw normalizeIntegrationError(new Error('Entre na plataforma para cancelar a ocorrência.'));
      }
      if (updatingOwn.current.has(id)) {
        throw new Error('Esta ocorrência já está sendo atualizada.');
      }

      updatingOwn.current.add(id);
      try {
        const incident = await incidentRepository.cancelOwnPending(id, user.id);
        setIncidents((current) => current.map((item) => item.id === id ? incident : item));
        return incident;
      } catch (cause) {
        throw normalizeIntegrationError(cause, 'Não foi possível cancelar a ocorrência.');
      } finally {
        updatingOwn.current.delete(id);
      }
    },
    [user],
  );

  const value = useMemo(
    () => ({
      incidents,
      loading,
      refreshing,
      error,
      readNotificationIds,
      notificationReadsLoading,
      notificationReadError,
      refresh,
      refreshNotificationReads,
      markNotificationRead,
      markAllNotificationsRead,
      create,
      updateStatus,
      updateOwnPending,
      cancelOwnPending,
    }),
    [
      incidents,
      loading,
      refreshing,
      error,
      readNotificationIds,
      notificationReadsLoading,
      notificationReadError,
      refresh,
      refreshNotificationReads,
      markNotificationRead,
      markAllNotificationsRead,
      create,
      updateStatus,
      updateOwnPending,
      cancelOwnPending,
    ],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useIncidents() {
  const value = useContext(C);
  if (!value) throw new Error('IncidentsProvider ausente');
  return value;
}
