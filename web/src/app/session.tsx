import { Alert } from '@tiagopedras/tenon'
import { createContext, useContext, type ReactNode } from 'react'
import { api } from '../api/endpoints'
import type { Meta, Who } from '../api/types'
import { Loading } from '../components/Loading'
import { useApi } from '../lib/useApi'

/** What every page needs: the vocabularies from /api/meta and who is signed in. */
export interface Session {
  meta: Meta
  me: Who
}

export const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const s = useApi(() => Promise.all([api.meta(), api.whoami()]).then(([meta, me]) => ({ meta, me })), [])
  if (s.error) return <Alert tone="error" title="Ledger did not load">{s.error.message}</Alert>
  if (!s.data) return <Loading />
  return <SessionContext.Provider value={s.data}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession is used outside SessionProvider')
  return s
}
