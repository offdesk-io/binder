import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@tiagopedras/tenon/tenon.css'
import '@tiagopedras/tenon/tenon-react.css'
import '@tiagopedras/tenon/tn-page.css'
import './styles.css'
import { App } from './app/App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
