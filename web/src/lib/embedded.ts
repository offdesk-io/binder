/** True when Binder runs inside another page's frame, the Offdesk shell at os.offdesk.io. The shell then shows the
 * brand, the signed-in person and Sign out, so Binder leaves them out. Reading window.top can throw across
 * origins; that also means framed. */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}
