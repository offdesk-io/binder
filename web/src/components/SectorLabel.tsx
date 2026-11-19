import type { CSSProperties } from 'react'
import { sectorColour } from '../lib/colour'

/** An organisation's sector as a label: small, bold, uppercase, in the sector's colour. Nothing when empty. */
export function SectorLabel({ sector }: { sector: string | null | undefined }) {
  const s = sector?.trim()
  if (!s) return null
  return <span className="tn-custom-sector" style={{ '--tn-sector': sectorColour(s).mark } as CSSProperties}>{s}</span>
}
