import type { Org } from '../api/types'

/** True when the organisation's name, sector or next step contains `needle`, ignoring case. An empty needle matches all. */
export function matchesText(org: Org, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  return !n || [org.name, org.sector, org.next_step].some((v) => v?.toLowerCase().includes(n))
}
