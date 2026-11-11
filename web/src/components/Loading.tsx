import { Spinner } from '@tiagopedras/tenon'

/* The ring, not the default orb: the orb draws on a canvas, which jsdom lacks. */
export function Loading() {
  return (
    <div className="lg-loading">
      <Spinner variant="ring" label="Loading" />
    </div>
  )
}
