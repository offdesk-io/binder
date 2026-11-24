import { ColumnEmpty } from '@tiagopedras/tenon'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './Layout'
import { HomePage } from '../pages/HomePage'
import { ClientsPage } from '../pages/ClientsPage'
import { ContactPage } from '../pages/ContactPage'
import { OrgPage } from '../pages/OrgPage'
import { PipelinePage } from '../pages/PipelinePage'
import { SearchPage } from '../pages/SearchPage'
import { SessionProvider } from './session'

/** The old List address. A drawer link (`?org=`) and the filters carry over. */
function ListRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/clients', search }} replace />
}

function NotFound() {
  return <ColumnEmpty>There is nothing at this address.</ColumnEmpty>
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="list" element={<ListRedirect />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="o/:slug" element={<OrgPage />} />
          <Route path="c/:id" element={<ContactPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
