import { render, screen } from '@testing-library/react';
import { Construction } from 'lucide-react';
import { expect, it } from 'vitest';
import { EmptyState } from '@/components/common/EmptyState';

it('renders its title as text, never a heading, under a decorative icon tile', () => {
  const { container } = render(
    <EmptyState icon={Construction} title="Nothing here yet" description="Add one to start." />,
  );
  expect(screen.getByText('Nothing here yet').tagName).toBe('P');
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(container.querySelector('svg')!.parentElement).toHaveAttribute('aria-hidden', 'true');
});
