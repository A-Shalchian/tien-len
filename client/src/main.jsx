import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App.jsx';
import { LanguageProvider } from './i18n/index.jsx';
import './fonts.css';
import './styles.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const container = document.getElementById('root');
const app = (
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>
);

if (container.dataset.prerendered === window.location.pathname) hydrateRoot(container, app);
else createRoot(container).render(app);
