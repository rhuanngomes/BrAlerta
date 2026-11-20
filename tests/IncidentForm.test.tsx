import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IncidentForm } from '../src/components/incidents/IncidentForm';
import type { IncidentCategory } from '../src/types';

describe('fluxo do formulário de ocorrência', () => {
  it('envia coordenadas e impede reenvio durante o salvamento', async () => {
    let finish: (() => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    render(<IncidentForm coords={{ lat: -23.025, lng: -43.465 }} onCancel={vi.fn()} onSubmit={onSubmit}/>);
    await user.type(screen.getByPlaceholderText(/Poste apagado/), 'Poste sem luz');
    await user.type(screen.getByPlaceholderText(/Descreva o problema/), 'O trecho está escuro há vários dias.');
    await user.click(screen.getByRole('button', { name: /Publicar ocorrência/ }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ latitude: -23.025, longitude: -43.465, category: 'STREETLIGHT' });
    expect(screen.getByRole('button', { name: /Publicando/ })).toBeDisabled();
    finish?.();
  });

  it('permite escolher a categoria e envia o local sem inventar um endereço', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <IncidentForm
        coords={{ lat: -23.025, lng: -43.465 }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const pothole = screen.getByRole('button', { name: /Buraco na rua/ });
    await user.click(pothole);
    expect(pothole).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByPlaceholderText(/Poste apagado/), 'Buraco na esquina');
    await user.type(screen.getByPlaceholderText(/Descreva o problema/), 'Asfalto danificado.');
    await user.click(screen.getByRole('button', { name: /Publicar ocorrência/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      category: 'POTHOLE',
      latitude: -23.025,
      longitude: -43.465,
    }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('address');
  });

  it('sincroniza as categorias 3D selecionadas com o formulário', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    function ControlledForm() {
      const [category, setCategory] = useState<IncidentCategory>('FLOOD');
      return (
        <IncidentForm
          category={category}
          onCategoryChange={setCategory}
          coords={{ lat: -23.025, lng: -43.465 }}
          onCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      );
    }

    render(<ControlledForm />);
    expect(screen.getByRole('button', { name: /Rua alagada/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: /Segurança/ }));
    await user.type(screen.getByPlaceholderText(/Poste apagado/), 'Risco no local');
    await user.type(screen.getByPlaceholderText(/Descreva o problema/), 'Relato de segurança.');
    await user.click(screen.getByRole('button', { name: /Publicar ocorrência/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: 'SAFETY' }));
  });

  it('publica trânsito com a categoria e as coordenadas escolhidas', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<IncidentForm coords={{ lat: -23.023, lng: -43.463 }} onCancel={vi.fn()} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /Trânsito intenso/ }));
    await user.type(screen.getByPlaceholderText(/Poste apagado/), 'Fila no cruzamento');
    await user.type(screen.getByPlaceholderText(/Descreva o problema/), 'Veículos parados nas duas pistas.');
    await user.click(screen.getByRole('button', { name: /Publicar ocorrência/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: 'TRAFFIC', latitude: -23.023, longitude: -43.463 }));
  });

  it('exige marcar um ponto no mapa antes de publicar', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<IncidentForm coords={null} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText(/Poste apagado/), 'Poste sem luz');
    await user.type(screen.getByPlaceholderText(/Descreva o problema/), 'O trecho está escuro.');
    await user.click(screen.getByRole('button', { name: /Publicar ocorrência/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('Clique no mapa para indicar o local.');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
