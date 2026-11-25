import { LinkButton } from '@tiagopedras/tenon'
import type { KeyPerson } from '../../api/types'
import { safeHref } from '../../lib/format'

/** One tap to reach someone: Email, Call and LinkedIn, each only when there is something to reach them on. */
export function ReachButtons({ c }: { c: Pick<KeyPerson, 'name' | 'email' | 'phone' | 'linkedin_url'> }) {
  const linkedin = safeHref(c.linkedin_url)
  if (!c.email && !c.phone && !linkedin) return null
  return (
    <span className="tn-custom-reach">
      {c.email && (
        <LinkButton size="sm" variant="secondary" href={`mailto:${c.email}`} aria-label={`Email ${c.name}`}>Email</LinkButton>
      )}
      {c.phone && (
        <LinkButton size="sm" variant="secondary" href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}>Call</LinkButton>
      )}
      {linkedin && (
        <LinkButton size="sm" variant="secondary" href={linkedin} target="_blank" rel="noreferrer" aria-label={`${c.name} on LinkedIn`}>
          LinkedIn
        </LinkButton>
      )}
    </span>
  )
}
