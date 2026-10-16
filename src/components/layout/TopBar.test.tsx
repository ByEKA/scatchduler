import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopBar } from '@/components/layout/TopBar';
import { brand } from '@/config/brand';
import { renderWithProviders } from '@/test/render';
import { mockViewport } from '@/test/viewport';

describe('TopBar', () => {
  it('toggles the inline sidebar', async () => {
    mockViewport(1440);
    const { user } = renderWithProviders(<TopBar />);
    const toggle = screen.getByRole('button', { name: 'Hide sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('offers the navigation drawer below 1024px', () => {
    mockViewport(800);
    renderWithProviders(<TopBar />);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });

  it('links the logo to Home', () => {
    renderWithProviders(<TopBar />);
    expect(screen.getByRole('link', { name: `${brand.name} home` })).toHaveAttribute(
      'href',
      '/home',
    );
  });
});
