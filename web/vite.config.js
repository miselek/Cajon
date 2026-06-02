import { defineConfig } from 'vite';

// Host: true zpřístupní dev server na síti (telefon na stejné Wi-Fi).
// Mikrofon vyžaduje HTTPS nebo localhost – pro test na telefonu spusť
// `npm run dev -- --host` a otevři přes https tunel (např. `vite preview`
// za reverzní proxy), nebo testuj na localhostu na počítači.
export default defineConfig({
  root: '.',
  // Relativní cesty k assetům – funguje na GitHub Pages (podadresa /Cajon/)
  // i na jakémkoliv jiném hostingu bez další konfigurace.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
