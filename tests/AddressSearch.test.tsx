import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { AddressSearch } from '../src/components/layout/AddressSearch';
import { searchAddresses } from '../src/services/geocoding';
vi.mock('../src/services/geocoding', () => ({ searchAddresses: vi.fn() }));
function Probe() { const location = useLocation(); return <output data-testid="target">{JSON.stringify({ path: location.pathname + location.search, state: location.state })}</output>; }
beforeEach(() => vi.clearAllMocks());
it('pesquisa ao enviar e leva o resultado selecionado ao mapa preservando o filtro', async () => {
  const user = userEvent.setup();
  const target = { lng: -43.19, lat: -22.91, label: 'Rua Riachuelo, Rio', locality: 'Rio', zoom: 18.7 };
  vi.mocked(searchAddresses).mockResolvedValue([target, { ...target, label: 'Outro endereço' }]);
  render(<MemoryRouter initialEntries={['/map?category=FLOOD']}><AddressSearch/><Probe/></MemoryRouter>);
  await user.type(screen.getByRole('combobox'), 'Riachuelo');
  expect(searchAddresses).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Pesquisar endereço' }));
  await user.click(await screen.findByRole('button', { name: target.label }));
  expect(JSON.parse(screen.getByTestId('target').textContent!)).toEqual({ path: '/map?category=FLOOD', state: { mapTarget: target } });
});
it('explica a falha e permite tentar novamente', async () => {
  vi.mocked(searchAddresses).mockRejectedValue(new Error('offline'));
  const user = userEvent.setup();
  render(<MemoryRouter><AddressSearch/></MemoryRouter>);
  await user.type(screen.getByRole('combobox'), 'Rua teste{Enter}');
  expect(await screen.findByRole('status')).toHaveTextContent('Não foi possível buscar agora');
  expect(screen.getByRole('button', { name: 'Pesquisar endereço' })).toBeEnabled();
});
