import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  // sonner keeps toasts in module state and replays the active ones to each new Toaster, so a
  // toast would otherwise show up in the next test of the file. After cleanup no Toaster listens.
  toast.dismiss();
  localStorage.clear();
  document.documentElement.className = '';
});

// Stubs for browser APIs that jsdom does not implement.
window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};
Element.prototype.setPointerCapture = () => {};
