import { screen } from '@testing-library/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';

function ShowToast({ message }: { message: string }) {
  useEffect(() => {
    toast.success(message);
  }, [message]);
  return null;
}

// sonner keeps its toasts in module state and replays the active ones to every new Toaster, so
// these two tests run in this order on purpose: the second checks what the first left behind.
describe('renderWithProviders toasts', () => {
  it('shows a toast through its Toaster', async () => {
    renderWithProviders(<ShowToast message="Left over" />);
    expect(await screen.findByText('Left over')).toBeInTheDocument();
  });

  it('starts without the toasts of earlier tests', async () => {
    renderWithProviders(<ShowToast message="Fresh" />);
    expect(await screen.findByText('Fresh')).toBeInTheDocument();
    expect(screen.queryByText('Left over')).not.toBeInTheDocument();
  });
});
