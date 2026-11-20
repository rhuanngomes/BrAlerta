import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { MapPage } from '../src/pages/MapPage';
import { useAuth } from '../src/context/AuthContext';
import { useIncidents } from '../src/context/IncidentsContext';
import type { Incident } from '../src/types';
vi.mock('../src/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../src/context/IncidentsContext', () => ({ useIncidents: vi.fn() }));
vi.mock('../src/components/map/CityMap', () => ({ CityMap: ({ incidents, focus, onSelect }: { incidents: Incident[]; focus: unknown; onSelect: (incident: Incident) => void }) => <div><output data-testid="focus">{JSON.stringify(focus)}</output>{incidents.map(incident => <button key={incident.id} onClick={() => onSelect(incident)}>{incident.title}</button>)}</div> }));
const base: Incident = { id: 'flood', userId: 'citizen', category: 'FLOOD', title: 'Alagamento teste', description: 'Descrição', latitude: -23, longitude: -43, status: 'PENDING', createdAt: '2026-11-19T12:00:00Z', updatedAt: '2026-11-19T12:00:00Z', history: [] };
const incidents = [base, { ...base, id: 'traffic', title: 'Trânsito teste', category: 'TRAFFIC' as const }, { ...base, id: 'resolved', title: 'Alagamento resolvido', status: 'RESOLVED' as const }];
beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ canManageIncidents: false, profile: { role: 'CITIZEN' } } as ReturnType<typeof useAuth>);
  vi.mocked(useIncidents).mockReturnValue({ incidents, updateStatus: vi.fn(), create: vi.fn() } as unknown as ReturnType<typeof useIncidents>);
});
it('combina categoria e status, sem oferecer atendimento ao cidadão', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/map?category=FLOOD']}><MapPage/></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Alagamento teste' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Trânsito teste' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Alagamento resolvido' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Filtrar por status'), 'RESOLVED');
  await user.click(screen.getByRole('button', { name: 'Alagamento resolvido' }));
  expect(screen.queryByRole('button', { name: 'Atualizar status' })).not.toBeInTheDocument();
});
it('entrega o endereço pesquisado à câmera', async () => {
  const target = { lat: -22.912, lng: -43.192, label: 'Rua Riachuelo', zoom: 18.7 };
  render(<MemoryRouter initialEntries={[{ pathname: '/map', state: { mapTarget: target } }]}><MapPage/></MemoryRouter>);
  await waitFor(() => expect(JSON.parse(screen.getByTestId('focus').textContent!)).toEqual(target));
});
it('reflete no detalhe o status atualizado do repositório sem reabrir a ocorrência', async () => {
  vi.mocked(useAuth).mockReturnValue({ canManageIncidents: true, profile: { role: 'PUBLIC_AGENT', organizationName: 'Prefeitura', publicPosition: 'Fiscal' } } as ReturnType<typeof useAuth>);
  const user = userEvent.setup();
  const { rerender } = render(<MemoryRouter><MapPage/></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Alagamento teste' }));
  expect(screen.getByRole('button', { name: 'Atualizar status' })).toBeInTheDocument();
  vi.mocked(useIncidents).mockReturnValue({ incidents: incidents.map(incident => incident.id === base.id ? { ...incident, status: 'RESOLVED' } : incident), updateStatus: vi.fn() } as unknown as ReturnType<typeof useIncidents>);
  rerender(<MemoryRouter><MapPage/></MemoryRouter>);
  expect(document.querySelector('.detail-status')).toHaveTextContent('Resolvido');
  expect(screen.queryByRole('button', { name: 'Alagamento teste' })).not.toBeInTheDocument();
});
