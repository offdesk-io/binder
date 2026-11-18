import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/* `npm run dev` serves the app on :5173 and sends /api to the backend on
 * :8770 (`BINDER_DB=binder.db .venv/bin/python -m binder` from the repo root).
 * `npm run build` writes web/dist, which the backend serves (binder/web.py). */
export default defineConfig(({ mode }) => {
  // BINDER_BASE=/binder serves the app under that path; unset keeps today's behaviour (served at the root).
  const { BINDER_BASE } = loadEnv(mode, '.', 'BINDER_')
  return {
    base: BINDER_BASE ? BINDER_BASE.replace(/\/?$/, '/') : '/',
    plugins: [react()],
    server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8770' } },
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  }
})
