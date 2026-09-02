import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/mesa-base.css'
import './styles/floor-tables.css'
import './styles/back-office-layout.css'
import './styles/back-office-roles.css'
import './styles/home-dashboard.css'
import './styles/dash-header.css'
import './styles/side-nav.css'
import './styles/accounts-module.css'
import './styles/drive-thru.css'
import './styles/quick-serve.css'
import App from './App.tsx'

const isDesktop = navigator.userAgent.toLowerCase().includes('electron')
if (!isDesktop) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
