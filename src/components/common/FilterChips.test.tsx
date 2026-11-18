import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterChips } from '@/components/common/FilterChips';
import { renderWithProviders } from '@/test/render';

describe('FilterChips', () => {
  it('shows one chip per filter with its remove button, then Clear filters', async () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <FilterChips
        chips={[
          { id: 'status', label: 'Status', value: 'On hold' },
          { id: 'stage', label: 'Stage', value: 'Closeout' },
        ]}
        onRemove={onRemove}
        onClear={onClear}
      />,
    );
    expect(screen.getByText('Status: On hold')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove filter Stage' }));
    expect(onRemove).toHaveBeenCalledWith('stage');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('renders nothing without chips', () => {
    renderWithProviders(<FilterChips chips={[]} onRemove={() => {}} onClear={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});
