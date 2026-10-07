import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/mesa-base.css'
import './styles/menu-picker.css'
import './styles/floor-tables.css'
import './styles/floor-diagram.css'
import './styles/back-office-layout.css'
import './styles/back-office-roles.css'
import './styles/home-dashboard.css'
import './styles/dash-header.css'
import './styles/hub-footer.css'
import './styles/side-nav.css'
import './styles/accounts-module.css'
import './styles/drive-thru.css'
import './styles/quick-serve.css'
import './styles/kitchen.css'
import './styles/inventory.css'
import './styles/purchase-orders.css'
import './styles/masters.css'
import './styles/vendors.css'
import './styles/payments.css'
import './styles/flash-toast.css'
import './styles/qty-stepper.css'
import './styles/dine-ticket.css'
import './styles/extra-charges.css'
import './styles/delivery-riders.css'
import './styles/delivery-desk.css'
import './styles/beverages.css'
import './styles/addons.css'
import './styles/receipt.css'
import './styles/customer-search.css'
import './styles/reports.css'
import './styles/barcode.css'
import './styles/access-denied.css'
import './styles/channel-honesty.css'
import './styles/guest-menu.css'
import './styles/softpos.css'
import './styles/menu-timetable.css'
import './styles/company-zatca.css'
import './styles/developer-portal.css'
import './styles/printers.css'
import App from './App.tsx'

const isDesktop = navigator.userAgent.toLowerCase().includes('electron')
if (!isDesktop) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // New deploy: drop stale shell so settings pages don't stay blank
      void updateSW(true)
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      // Check for a newer SW shortly after load (post-deploy)
      window.setTimeout(() => void reg.update(), 1500)
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
