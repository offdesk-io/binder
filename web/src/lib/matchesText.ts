import type { Org } from '../api/types'
import { sectorLabel } from './sectors'

/** True when the organisation's name, sector or description contains `needle`, ignoring case. An empty needle matches all. */
export function matchesText(org: Org, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  return !n || [org.name, org.sector, sectorLabel(org.sector), org.description].some((v) => v?.toLowerCase().includes(n))
}
