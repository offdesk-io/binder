/** The sector keys the server keeps, and what the screens call them. */
export const SECTOR_LABEL: Record<string, string> = {
  manufacturing: 'Manufacturing',
  consulting: 'Consulting',
  technology: 'Technology',
  retail_ecommerce: 'Retail and e-commerce',
  healthcare: 'Healthcare',
  construction_installations: 'Construction and installations',
  finance: 'Finance',
}

/** A sector's name for people. A value the list does not know (an older free-text one) shows as it is. */
export function sectorLabel(sector: string | null | undefined): string {
  const s = sector?.trim() ?? ''
  return SECTOR_LABEL[s] ?? s
}
