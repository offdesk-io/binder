import { Alert } from '@tiagopedras/tenon'
import { useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import { Loading } from '../components/Loading'
import { useApi } from '../lib/useApi'
import { OrgDetail } from './org/OrgDetail'

export function OrgPage() {
  const { slug = '' } = useParams()
  const org = useApi(() => api.orgBySlug(slug), [slug])
  if (org.error && !org.data) return <Alert tone="error" title="Could not open this organisation">{org.error.message}</Alert>
  if (!org.data) return <Loading />
  // A failed refresh keeps the page that is already on screen.
  return <OrgDetail key={org.data.id} frame="page" org={org.data} setOrg={org.setData} reloadOrg={org.reload} refreshError={org.error?.message} />
}
