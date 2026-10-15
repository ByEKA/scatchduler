import { StrictMode } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/index.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './index.css';
import { App } from './app/App';
import { StartupError } from './components/common/StartupError';
import { createDataLayer } from './data';

// A wrong VITE_* setting makes createDataLayer throw; the page then shows that message.
let content: ReactElement;
try {
  content = <App dataLayer={createDataLayer()} />;
} catch (error) {
  console.error(error);
  content = <StartupError message={error instanceof Error ? error.message : String(error)} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>);
