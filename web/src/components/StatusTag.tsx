import { label } from '../lib/format'
import { stageColour } from '../lib/colour'
import { ColourTag } from './ColourTag'

export function StatusTag({ status }: { status: string }) {
  return <ColourTag colour={stageColour(status)}>{label(status)}</ColourTag>
}
