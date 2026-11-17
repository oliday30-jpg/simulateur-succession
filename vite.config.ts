/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/** CSP stricte injectée au build seulement (le mode dev de Vite utilise un script inline). */
const csp = (): Plugin => ({
  name: 'csp-locale',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'" />`),
});

// Outil 100 % local : base relative pour pouvoir ouvrir dist/ via `npm run preview`.
export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
