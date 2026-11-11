import { Button } from '@tiagopedras/tenon'
import { useState } from 'react'

/** Two clicks to delete: the first asks, the second deletes. No browser dialog. */
export function ConfirmDelete({ what, onConfirm }: { what: string; onConfirm: () => void }) {
  const [asked, setAsked] = useState(false)
  return asked ? (
    <Button variant="destructive" onClick={onConfirm}>Delete this {what}</Button>
  ) : (
    <Button variant="danger" onClick={() => setAsked(true)}>Delete</Button>
  )
}
