import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, vi } from 'vitest';
import { resetViewport } from '@/test/viewport';

afterEach(() => {
  cleanup();
  // sonner keeps toasts in module state and replays the active ones to each new Toaster, so a
  // toast would otherwise show up in the next test of the file. After cleanup no Toaster listens.
  toast.dismiss();
  localStorage.clear();
  document.documentElement.className = '';
  resetViewport();
});

// Stubs for browser APIs that jsdom does not implement. matchMedia matches no query until a test
// calls mockViewport.
resetViewport();

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
Element.prototype.setPointerCapture = () => {};
