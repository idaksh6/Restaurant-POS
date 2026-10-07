import type { ReactNode } from 'react'
import type { NavKey } from '../auth/roles'

function Line({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      {children}
    </svg>
  )
}

export function IconHome() {
  return (
    <Line>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </Line>
  )
}

export function IconTables() {
  return (
    <Line>
      <rect x="3" y="7" width="18" height="4" rx="1.5" />
      <path d="M6 11v7M18 11v7M10 11v4M14 11v4" />
    </Line>
  )
}

export function IconBag() {
  return (
    <Line>
      <path d="M7 7h10v4H7V7Z" />
      <path d="M9 11v8M15 11v8M5 19h14" />
    </Line>
  )
}

export function IconTruck() {
  return (
    <Line>
      <path d="M3 7h11v10H3V7Z" />
      <path d="M14 10h4l3 3v4h-7v-7Z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </Line>
  )
}

export function IconKitchen() {
  return (
    <Line>
      <path d="M4 10h16v9H4v-9Z" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Line>
  )
}

export function IconCar() {
  return (
    <Line>
      <path d="M4 14h16l-1.5-5H6L4 14Z" />
      <path d="M7 9 8.2 6h7.6L17 9" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="16.5" cy="16.5" r="1.5" />
    </Line>
  )
}

export function IconBoxes() {
  return (
    <Line>
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M3 8.5 12 14l9-5.5M12 14v7" />
    </Line>
  )
}

export function IconOffice() {
  return (
    <Line>
      <path d="M4 20V6a2 2 0 0 1 2-2h7v16H4Z" />
      <path d="M13 10h5a2 2 0 0 1 2 2v8h-7V10Z" />
      <path d="M7 8h2M7 12h2M7 16h2M16 14h2M16 17h2" />
    </Line>
  )
}

export function IconPay() {
  return (
    <Line>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 14h4" />
    </Line>
  )
}

export function IconOnline() {
  return (
    <Line>
      <circle cx="12" cy="12" r="8" />
      <path d="M3 12h18M12 4c2.5 2.8 2.5 12.2 0 16M12 4c-2.5 2.8-2.5 12.2 0 16" />
    </Line>
  )
}

export function IconCrm() {
  return (
    <Line>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 19c0-2 2-3.5 4.5-3.5S23 17 23 19" />
    </Line>
  )
}

export function IconMasters() {
  return (
    <Line>
      <path d="M4 7h16M4 12h16M4 17h10" />
      <circle cx="18" cy="17" r="2" />
    </Line>
  )
}

export function IconSettings() {
  return (
    <Line>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" />
      <path d="M12 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" />
    </Line>
  )
}

export function IconSuppliers() {
  return (
    <Line>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </Line>
  )
}

export function IconPO() {
  return (
    <Line>
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M15 3v4h4M9 12h6M9 16h6" />
    </Line>
  )
}

export function IconExpenses() {
  return (
    <Line>
      <path d="M7 3h7l3 3v15H7V3Z" />
      <path d="M14 3v3h3" />
      <path d="M9 11h6M9 15h4" />
    </Line>
  )
}

export function IconAccounts() {
  return (
    <Line>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h6M7 17h8" />
    </Line>
  )
}

export function IconReports() {
  return (
    <Line>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-4M12 15V8M16 15v-7" />
    </Line>
  )
}

export const navIcons: Record<NavKey, () => ReactNode> = {
  home: IconHome,
  'dine-in': IconTables,
  payments: IconPay,
  takeaway: IconBag,
  'drive-thru': IconCar,
  delivery: IconTruck,
  online: IconOnline,
  kitchen: IconKitchen,
  inventory: IconBoxes,
  expenses: IconExpenses,
  accounts: IconAccounts,
  reports: IconReports,
  suppliers: IconSuppliers,
  'purchase-orders': IconPO,
  crm: IconCrm,
  masters: IconMasters,
  settings: IconSettings,
  'back-office': IconOffice,
}
