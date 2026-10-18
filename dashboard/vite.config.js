import { defineConfig } from 'vite';

// The wall tablet runs Android WebView 106 — keep JS output within Chromium 106.
// CSS targets chrome61 on purpose: the tablet's WebView rejects 4/8-digit hex colours (#0000,
// #ffffffbf) even though Chrome 106 should support them, and a newer target lets the minifier
// rewrite transparent/rgba() into that form. Verified on-device with CSS.supports().
export default defineConfig({
  build: {
    target: 'chrome106',
    cssTarget: 'chrome61',
    rollupOptions: { input: { main: 'index.html', upload: 'upload.html', m: 'm.html' } },
  },
  // `npm run dev` serves the UI; /api goes to `npm run dev:api` (wrangler dev, local D1 + R2).
  server: { host: true, proxy: { '/api': 'http://localhost:8787' } },
});
