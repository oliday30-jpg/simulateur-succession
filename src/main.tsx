import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Hors connexion : uniquement sur la version publiée (pas en développement).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* hors connexion indisponible */ });
  });
}

// Demande au navigateur de ne pas effacer les données de l'appli en cas de manque d'espace.
try { void navigator.storage?.persist?.(); } catch { /* non pris en charge */ }
