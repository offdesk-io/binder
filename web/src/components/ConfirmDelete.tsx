import { Button } from '@tiagopedras/tenon'
import { useState } from 'react'

/** Two clicks to delete: the first asks, the second deletes. No browser dialog. `note`, shown with the second
 * button, says what deleting keeps or takes with it. */
export function ConfirmDelete({ what, note, onConfirm }: { what: string; note?: string; onConfirm: () => void }) {
  const [asked, setAsked] = useState(false)
  return asked ? (
    <>
      {note && <span className="tenon-caption">{note}</span>}
      <Button variant="destructive" size="sm" onClick={onConfirm}>Delete this {what}</Button>
    </>
  ) : (
    <Button variant="danger" size="sm" onClick={() => setAsked(true)}>Delete</Button>
  )
}
