import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TagBadges } from '@/components/common/TagBadges';

describe('TagBadges', () => {
  it('names the current schedule and the baselines, and nothing else', () => {
    const { rerender, container } = render(
      <TagBadges schedule={{ isCurrent: true, baseline: 'primary' }} />,
    );
    expect([...container.querySelectorAll('span')].map((s) => s.textContent)).toEqual([
      'Current',
      'Primary baseline',
    ]);
    rerender(<TagBadges schedule={{ isCurrent: false, baseline: 'baseline' }} />);
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    rerender(<TagBadges schedule={{ isCurrent: false, baseline: 'none' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
