import { Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { HomePage } from '../pages/HomePage'
import { ListPage } from '../pages/ListPage'
import { ContactPage } from '../pages/ContactPage'
import { OrgPage } from '../pages/OrgPage'
import { PipelinePage } from '../pages/PipelinePage'
import { SearchPage } from '../pages/SearchPage'
import { SessionProvider } from './session'

function NotFound() {
  return <p className="tn-custom-faint">There is nothing at this address.</p>
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="list" element={<ListPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="o/:slug" element={<OrgPage />} />
          <Route path="c/:id" element={<ContactPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
