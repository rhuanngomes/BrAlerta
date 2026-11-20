import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/components/layout/AppShell';
import { useAuth } from '../src/context/AuthContext';
import { useIncidents } from '../src/context/IncidentsContext';
import type { Incident } from '../src/types';

vi.mock('../src/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../src/context/IncidentsContext', () => ({
  useIncidents: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  const incidentId = (location.state as { incidentId?: string } | null)?.incidentId;
  return <span data-testid="location" data-search={location.search}>{`${location.pathname}:${incidentId ?? ''}`}</span>;
}

function makeIncident(): Incident {
  return {
    id: 'BRA-0001',
    userId: 'citizen-1',
    category: 'POTHOLE',
    title: 'Buraco na avenida',
    description: 'Descrição do problema',
    latitude: -23.025,
    longitude: -43.465,
    status: 'IN_PROGRESS',
    createdAt: '2025-04-12T14:32:00.000Z',
    updatedAt: '2025-04-13T14:32:00.000Z',
    history: [
      {
        id: 'history-created',
        incidentId: 'BRA-0001',
        newStatus: 'PENDING',
        changedBy: 'citizen-1',
        changedAt: '2025-04-12T14:32:00.000Z',
      },
      {
        id: 'history-updated',
        incidentId: 'BRA-0001',
        previousStatus: 'PENDING',
        newStatus: 'IN_PROGRESS',
        changedBy: 'admin-1',
        changedAt: '2025-04-13T14:32:00.000Z',
      },
    ],
  };
}

function setup(incidents: Incident[] = []) {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const markNotificationRead = vi.fn().mockResolvedValue(undefined);
  const markAllNotificationsRead = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'citizen-1', email: 'ana@example.com' },
    profile: {
      id: 'citizen-1',
      email: 'ana@example.com',
      fullName: 'Ana Silva',
      role: 'CITIZEN',
    },
    loading: false,
    error: null,
    isAdmin: false,
    signIn: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn().mockResolvedValue({ needsEmailConfirmation: false }),
    signOut: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
  });
  vi.mocked(useIncidents).mockReturnValue({
    incidents,
    loading: false,
    refreshing: false,
    error: null,
    readNotificationIds: [],
    notificationReadsLoading: false,
    notificationReadError: null,
    refresh,
    refreshNotificationReads: vi.fn().mockResolvedValue(undefined),
    markNotificationRead,
    markAllNotificationsRead,
    create: vi.fn().mockResolvedValue(incidents[0]),
    updateStatus: vi.fn(),
    updateOwnPending: vi.fn(),
    cancelOwnPending: vi.fn(),
  });

  render(
    <MemoryRouter initialEntries={['/map']}>
      <AppShell />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { refresh, markNotificationRead, markAllNotificationsRead };
}

describe('notificações no layout principal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('informa claramente quando ainda não há notificações', async () => {
    const { refresh } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Notificações' }));

    expect(await screen.findByText('Não há nenhuma notificação no momento.'))
      .toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('mostra novos registros e atualizações e permite abrir a ocorrência no mapa', async () => {
    const { markNotificationRead } = setup([makeIncident()]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Notificações' }));

    expect(await screen.findByText('Nova ocorrência registrada')).toBeInTheDocument();
    expect(screen.getByText('Ocorrência atualizada')).toBeInTheDocument();
    expect(screen.getByText('Buraco na avenida · Pendente → Em andamento'))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Nova ocorrência registrada/ }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/map:BRA-0001'));
    expect(markNotificationRead).toHaveBeenCalledWith('BRA-0001-created');
  });

  it('mostra o total não lido e permite marcar tudo como lido', async () => {
    const { markAllNotificationsRead } = setup([makeIncident()]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Notificações' }));

    expect(await screen.findByText('2 não lidas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    expect(markAllNotificationsRead).toHaveBeenCalledWith([
      'history-updated',
      'BRA-0001-created',
    ]);
  });
});

it('filtra categorias, limpa o filtro e recolhe o menu', async () => {
  const user = userEvent.setup();
  setup();
  await user.click(screen.getByRole('button', { name: 'Rua alagada', exact: true }));
  expect(screen.getByTestId('location')).toHaveAttribute('data-search', '?category=FLOOD');
  expect(screen.getByRole('button', { name: 'Rua alagada', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Todas as categorias' }));
  expect(screen.getByTestId('location')).toHaveAttribute('data-search', '');
  await user.click(screen.getByRole('button', { name: 'Categorias', exact: true }));
  expect(screen.queryByRole('button', { name: 'Rua alagada' })).not.toBeInTheDocument();
});
