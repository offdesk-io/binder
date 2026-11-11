import { Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { HomePage } from '../pages/HomePage'
import { ListPage } from '../pages/ListPage'
import { SearchPage } from '../pages/SearchPage'
import { SessionProvider } from './session'

function NotFound() {
  return <p className="lg-faint">There is nothing at this address.</p>
}

function Soon({ name }: { name: string }) {
  return <p className="lg-faint">{name}</p>
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="pipeline" element={<Soon name="Pipeline" />} />
          <Route path="list" element={<ListPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="o/:slug" element={<Soon name="Organisation" />} />
          <Route path="c/:id" element={<Soon name="Contact" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
