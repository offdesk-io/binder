/** Where the app is served from: '' at a host's root, '/binder' inside the Offdesk shell. It is set at build
 * time by BINDER_BASE (see vite.config.ts), which Vite exposes as BASE_URL ('/' or '/binder/'). */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export function withBase(path: string, base: string = BASE): string {
  return base.replace(/\/$/, '') + path
}
