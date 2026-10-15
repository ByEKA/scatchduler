import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

describe('ThemeProvider', () => {
  it('defaults to dark and marks <html>', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('toggles to light, removes the class and persists ui.theme', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('ui.theme')).toBe('light');
  });

  it('starts from a stored light theme', () => {
    localStorage.setItem('ui.theme', 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('light');
  });
});
