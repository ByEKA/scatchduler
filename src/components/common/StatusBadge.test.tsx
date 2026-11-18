import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/common/StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['active', 'Active', ['text-foreground']],
    ['on_hold', 'On hold', ['bg-warning-bg', 'text-warning-foreground', 'border-warning-border']],
    ['completed', 'Completed', ['bg-muted', 'text-muted-foreground']],
    ['cancelled', 'Cancelled', ['text-destructive', 'border-destructive']],
  ] as const)('shows %s as "%s" on its tokens, on an opaque chip', (status, label, tokens) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toHaveClass(...tokens);
    expect(container.querySelector(`[data-status="${status}"]`)).toHaveClass('bg-card');
    expect(container.querySelector('.bg-success') !== null).toBe(status === 'active');
  });
});
