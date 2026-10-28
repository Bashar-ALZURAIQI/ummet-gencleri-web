import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Vite emits this when a lazy route's old deployment asset no longer exists.
// Refresh once to load the current HTML/chunk map; persistent network failure
// still reaches the existing RouteChunkErrorBoundary for manual recovery.
window.addEventListener('vite:preloadError', (event: Event) => {
  const key = 'ummet_route_preload_recovered_at';
  const now = Date.now();
  try {
    const last = Number(window.sessionStorage.getItem(key)) || 0;
    if (now - last < 60_000) return;
    window.sessionStorage.setItem(key, String(now));
    event.preventDefault();
    window.location.reload();
  } catch {
    // Disabled session storage: avoid an uncontrolled reload loop.
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
