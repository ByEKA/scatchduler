import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GoogleMark } from '@/components/common/GoogleMark';

it('renders the owner-supplied mark only when a file exists', () => {
  const { container, rerender } = render(<GoogleMark src="/mark.svg" />);
  expect(container.querySelector('img')).toHaveAttribute('src', '/mark.svg');
  expect(container.querySelector('img')).toHaveAttribute('alt', '');
  rerender(<GoogleMark src={null} />);
  expect(container.firstChild).toBeNull();
});
