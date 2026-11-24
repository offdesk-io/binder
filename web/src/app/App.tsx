import { ColumnEmpty } from '@tiagopedras/tenon'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { HomePage } from '../pages/HomePage'
import { ListPage } from '../pages/ListPage'
import { ContactPage } from '../pages/ContactPage'
import { OrgPage } from '../pages/OrgPage'
import { PartnersPage } from '../pages/PartnersPage'
import { PeoplePage } from '../pages/PeoplePage'
import { PipelinePage } from '../pages/PipelinePage'
import { SearchPage } from '../pages/SearchPage'
import { SessionProvider } from './session'

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
          <Route path="list" element={<ListPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="o/:slug" element={<OrgPage />} />
          <Route path="c/:id" element={<ContactPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
