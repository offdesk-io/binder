import { Tag } from '@tiagopedras/tenon'
import { label, statusTone } from '../lib/format'

export function StatusTag({ status }: { status: string }) {
  return <Tag tone={statusTone(status)}>{label(status)}</Tag>
}
