import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeActivity } from '@/engine/testing';
import { ScheduleSearch } from '@/features/schedule/ScheduleSearch';
import { findMatchingActivityIds } from '@/features/schedule/search';

function SearchHarness({
  onJump,
  onFilterChange,
}: {
  onJump: (id: string) => void;
  onFilterChange: (active: boolean) => void;
}) {
  const activities = useMemo(
    () => [
      makeActivity({ id: 'a1', code: 'A1010', name: 'Concrete Foundation' }),
      makeActivity({ id: 'a2', code: 'A1020', name: 'Concrete Columns' }),
      makeActivity({ id: 'a3', code: 'A1030', name: 'Steel Roof' }),
    ],
    [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [filterActive, setFilterActive] = useState(false);

  const matches = useMemo(() => findMatchingActivityIds(activities, query), [activities, query]);

  const handleQueryChange = (next: string) => {
    setQuery(next);
    setActiveIndex(0);
    const nextMatches = findMatchingActivityIds(activities, next);
    if (nextMatches.length > 0) onJump(nextMatches[0]!);
  };

  const handleStep = (delta: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (activeIndex + delta + matches.length) % matches.length;
    setActiveIndex(next);
    onJump(matches[next]!);
  };

  return (
    <ScheduleSearch
      inputRef={inputRef}
      query={query}
      onQueryChange={handleQueryChange}
      matches={matches}
      activeIndex={activeIndex}
      onStep={handleStep}
      filterActive={filterActive}
      onToggleFilter={() => {
        const next = !filterActive;
        setFilterActive(next);
        onFilterChange(next);
      }}
    />
  );
}

describe('ScheduleSearch', () => {
  it('displays match counts, cycles prev/next, jumps to matches, and toggles Filter', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const onFilterChange = vi.fn();

    render(<SearchHarness onJump={onJump} onFilterChange={onFilterChange} />);

    const input = screen.getByRole('searchbox', { name: 'Search activities' });
    await user.type(input, 'Concrete');

    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(onJump).toHaveBeenLastCalledWith('a1');

    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(onJump).toHaveBeenLastCalledWith('a2');

    // Cycling wraps around
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(onJump).toHaveBeenLastCalledWith('a1');

    // Shift+Enter steps backward
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(onJump).toHaveBeenLastCalledWith('a2');

    // Filter toggle
    const filterBtn = screen.getByRole('button', { name: 'Filter' });
    expect(filterBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(filterBtn);
    expect(filterBtn).toHaveAttribute('aria-pressed', 'true');
    expect(onFilterChange).toHaveBeenCalledWith(true);

    // Non-matching query displays 0 of 0
    await user.clear(input);
    await user.type(input, 'NoSuchTask');
    expect(screen.getByText('0 of 0')).toBeInTheDocument();
  });
});
