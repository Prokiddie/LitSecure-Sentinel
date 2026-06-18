import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ─── Global Fetch Interceptor ─────────────────────────────────────────────────
// Automatically attaches the JWT token to all /api/* requests
// and handles 401 responses by clearing the session and reloading.
const _originalFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input as Request).url;

  // Only intercept our own API calls
  if (typeof url === 'string' && url.startsWith('/api/') && !url.startsWith('/api/auth/login')) {
    const token = sessionStorage.getItem('sentinel_token');
    if (token) {
      init = {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      };
    }
  }

  const response = await _originalFetch(input, init);

  // If unauthorized and not already on auth endpoint — clear session and reload
  if (
    response.status === 401 &&
    typeof url === 'string' &&
    url.startsWith('/api/') &&
    !url.includes('/auth/')
  ) {
    sessionStorage.removeItem('sentinel_token');
    sessionStorage.removeItem('sentinel_user');
    window.location.reload();
  }

  return response;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
