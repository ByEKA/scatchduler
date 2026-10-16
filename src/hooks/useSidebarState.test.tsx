import { act, screen } from '@testing-library/react';
import { Link, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useSidebarState } from '@/hooks/useSidebarState';
import { renderWithProviders } from '@/test/render';
import { mockViewport } from '@/test/viewport';

function Probe() {
  const { mode, open, toggle } = useSidebarState();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="sidebar">{`${mode}|${String(open)}`}</p>
      <button onClick={toggle}>toggle</button>
      <Link to="/library">go</Link>
      <button onClick={() => void navigate(-1)}>back</button>
      <button onClick={() => void navigate(1)}>forward</button>
    </>
  );
}

describe('useSidebarState', () => {
  it('is inline and open on desktop, and persists closing', async () => {
    mockViewport(1440);
    const { user } = renderWithProviders(<Probe />, { route: '/home' });
    expect(screen.getByTestId('sidebar')).toHaveTextContent('inline|true');
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('inline|false');
    expect(localStorage.getItem('ui.sidebarOpen')).toBe('false');
  });

  it('starts closed when ui.sidebarOpen is "false"', () => {
    mockViewport(1440);
    localStorage.setItem('ui.sidebarOpen', 'false');
    renderWithProviders(<Probe />, { route: '/home' });
    expect(screen.getByTestId('sidebar')).toHaveTextContent('inline|false');
  });

  it('uses a closed drawer below 1024px that closes on navigation', async () => {
    mockViewport(800);
    const { user } = renderWithProviders(<Probe />, { route: '/home' });
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|false');
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|true');
    await user.click(screen.getByRole('link', { name: 'go' }));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|false');
  });

  it('keeps the drawer closed when history returns to the page it was opened on', async () => {
    mockViewport(800);
    const { user } = renderWithProviders(<Probe />, { route: '/home' });
    await user.click(screen.getByRole('link', { name: 'go' }));
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|true');
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/home');
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|false');
    await user.click(screen.getByRole('button', { name: 'forward' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/library');
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|false');
  });

  it('switches modes when the viewport crosses 1024px and drops a drawer left open', async () => {
    mockViewport(800);
    const { user } = renderWithProviders(<Probe />, { route: '/home' });
    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|true');
    act(() => mockViewport(1440));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('inline|true');
    act(() => mockViewport(800));
    expect(screen.getByTestId('sidebar')).toHaveTextContent('drawer|false');
  });
});
