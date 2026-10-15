import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { readKey, writeKey } from '@/lib/storage';

export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
}

const THEME_KEY = 'ui.theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Dark is the default (spec 4.5); only an explicit stored 'light' switches it. index.html applies
// the same rule before the first paint.
function storedTheme(): Theme {
  return readKey(THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    writeKey(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
