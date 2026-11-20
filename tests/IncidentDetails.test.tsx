import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IncidentDetails } from '../src/components/incidents/IncidentDetails';
import type { Incident } from '../src/types';

const incident: Incident = {
  id: 'BRA-0001',
  userId: 'user-1',
  category: 'STREETLIGHT',
  title: 'Poste apagado na Rua Uruguaiana',
  description: 'O poste está sem iluminação há mais de uma semana.',
  latitude: -23.0244,
  longitude: -43.4642,
  address: 'Rua Uruguaiana, 123 - Centro, Rio de Janeiro - RJ',
  status: 'PENDING',
  photoUrl: 'https://example.com/incident.jpg',
  createdAt: '2025-04-12T14:32:00.000Z',
  updatedAt: '2025-04-12T14:32:00.000Z',
  history: [{
    id: 'history-1',
    incidentId: 'BRA-0001',
    newStatus: 'PENDING',
    changedBy: 'Cidadão',
    changedAt: '2025-04-12T14:32:00.000Z',
  }],
};

describe('detalhes da ocorrência selecionada', () => {
  it('exibe os dados, o histórico e permite centralizar no mapa', () => {
    const onMap = vi.fn();
    render(<IncidentDetails incident={incident} onClose={vi.fn()} onMap={onMap} />);

    expect(screen.getByRole('img', { name: /Foto da ocorrência/ })).toHaveAttribute(
      'src',
      incident.photoUrl,
    );
    expect(screen.getByText(incident.title)).toBeInTheDocument();
    expect(screen.getByText(incident.address!)).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(screen.getByText('Resolvido')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ver no mapa/ }));
    expect(onMap).toHaveBeenCalledOnce();
  });

  it('mostra uma capa alternativa quando a ocorrência não tem foto', () => {
    render(
      <IncidentDetails
        incident={{ ...incident, photoUrl: undefined }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Foto não adicionada')).toBeInTheDocument();
  });
});

it('oferece atendimento somente quando autorizado e salva o status escolhido', async () => {
  const update = vi.fn().mockResolvedValue({ ...incident, status: 'RESOLVED' });
  const { rerender } = render(<IncidentDetails incident={incident} onClose={vi.fn()}/>);
  expect(screen.queryByRole('button', { name: 'Atualizar status' })).not.toBeInTheDocument();
  rerender(<IncidentDetails incident={incident} onClose={vi.fn()} onUpdateStatus={update} attendant="Prefeitura · Fiscal"/>);
  fireEvent.change(screen.getByLabelText('Novo status'), { target: { value: 'RESOLVED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar status' }));
  expect(update).toHaveBeenCalledWith('RESOLVED');
  expect(await screen.findByRole('status')).toHaveTextContent('Status atualizado');
});
