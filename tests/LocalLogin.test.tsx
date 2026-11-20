import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../src/components/layout/AppShell';
import { AuthProvider } from '../src/context/AuthContext';
import { IncidentsProvider } from '../src/context/IncidentsContext';
import { LoginPage } from '../src/pages/LoginPage';

function RoutedApp() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route path="/map" element={<h1>Mapa principal</h1>} />
      </Route>
    </Routes>
  );
}

describe('acesso demonstrativo local', () => {
  it('entra, abre o menu do perfil e permite trocar de usuário', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <IncidentsProvider>
          <MemoryRouter initialEntries={['/login']}>
            <RoutedApp />
          </MemoryRouter>
        </IncidentsProvider>
      </AuthProvider>,
    );

    expect(screen.getByText(/Ambiente demonstrativo/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('voce@email.com'), 'demo@example.com');
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha-local');
    await user.click(screen.getByRole('button', { name: /Entrar/ }));

    expect(await screen.findByRole('heading', { name: 'Mapa principal' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir menu da conta de demo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Entrar com outro usuário' }));

    expect(await screen.findByRole('heading', { name: 'Entre na sua conta' })).toBeInTheDocument();
  });
});
