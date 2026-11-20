import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './', // rutas relativas: funciona en Android (Capacitor) y en GitHub Pages (/mtigo/)
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 600 },
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] },
});
