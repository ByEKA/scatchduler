import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { brand } from '@/config/brand';

it('renders the wordmark from brand config next to a decorative mark', () => {
  const { container } = render(<BrandLogo />);
  expect(screen.getByText(brand.name)).toBeInTheDocument();
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});
