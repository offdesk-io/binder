import { Tag } from '@tiagopedras/tenon'
import type { Kind } from '../api/types'
import { KIND_LABEL, KIND_TONE } from '../lib/kinds'

export function KindTag({ kind }: { kind: Kind }) {
  return <Tag tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Tag>
}
