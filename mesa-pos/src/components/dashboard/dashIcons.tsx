import type { ReactNode } from 'react'

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

export function IconPlate() {
  return (
    <Glyph>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="2.2" />
      <path d="M8 4.5h8" />
    </Glyph>
  )
}
export function IconBolt() {
  return (
    <Glyph>
      <path d="M13 2 6 13h6l-1 9 7-11h-6l1-9Z" />
    </Glyph>
  )
}
export function IconCar() {
  return (
    <Glyph>
      <path d="M4 14h16l-1.5-5H6L4 14Z" />
      <path d="M7 9 8.2 6h7.6L17 9" />
      <circle cx="7.5" cy="16.5" r="1.6" />
      <circle cx="16.5" cy="16.5" r="1.6" />
    </Glyph>
  )
}
export function IconBike() {
  return (
    <Glyph>
      <circle cx="6.5" cy="16" r="3" />
      <circle cx="17.5" cy="16" r="3" />
      <path d="M6.5 16 11 8h3l3.5 8M11 8 8 16M14 8l-2 4h5" />
    </Glyph>
  )
}
export function IconGlobe() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.6 2.8 2.6 12.2 0 16M12 4c-2.6 2.8-2.6 12.2 0 16" />
    </Glyph>
  )
}
export function IconBag() {
  return (
    <Glyph>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </Glyph>
  )
}
export function IconUser() {
  return (
    <Glyph>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
    </Glyph>
  )
}
export function IconBarcode() {
  return (
    <Glyph>
      <path d="M5 5v14M8 5v14M10.5 5v9M13 5v14M16 5v10M19 5v14" />
    </Glyph>
  )
}
export function IconUnsettled() {
  return (
    <Glyph>
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M15 3v4h4M9 12h8M9 16h5" />
    </Glyph>
  )
}
export function IconCalendar() {
  return (
    <Glyph>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4M9 14.5l2 2 4-4" />
    </Glyph>
  )
}
export function IconWallet() {
  return (
    <Glyph>
      <rect x="3.5" y="6" width="17" height="13" rx="2" />
      <path d="M16 12.5h4.5M3.5 9.5h17" />
    </Glyph>
  )
}
export function IconAccounts() {
  return (
    <Glyph>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8 14h5" />
    </Glyph>
  )
}
export function IconGear() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12H20.5M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6" />
    </Glyph>
  )
}
export function IconKitchen() {
  return (
    <Glyph>
      <path d="M5 13h14v7H5v-7Z" />
      <path d="M8 13V9a4 4 0 0 1 8 0v4" />
    </Glyph>
  )
}
export function IconServer() {
  return (
    <Glyph>
      <path d="M5 15h14l-1.5 5H6.5L5 15Z" />
      <path d="M8 15V9.5a4 4 0 0 1 8 0V15" />
      <path d="M10 7.5h4" />
      <circle cx="12" cy="5" r="1.4" />
    </Glyph>
  )
}
export function IconTicket() {
  return (
    <Glyph>
      <path d="M4 7h16v3a2.5 2.5 0 1 0 0 4v3H4v-3a2.5 2.5 0 1 0 0-4V7Z" />
      <path d="M9 10.5v5" />
    </Glyph>
  )
}
export function IconTable() {
  return (
    <Glyph>
      <rect x="3" y="7" width="18" height="4" rx="1.5" />
      <path d="M6 11v8M18 11v8M9 11v4M15 11v4" />
    </Glyph>
  )
}
export function IconReceipt() {
  return (
    <Glyph>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Glyph>
  )
}
export function IconChef() {
  return (
    <Glyph>
      <path d="M7 14.5a4 4 0 0 1-.8-7.9 5 5 0 0 1 9.6 0 4 4 0 0 1-.8 7.9" />
      <path d="M7 14.5V20h10v-5.5M7 17h10" />
    </Glyph>
  )
}
export function IconCash() {
  return (
    <Glyph>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.5" />
      <path d="M5 6.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5M5 11.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" />
    </Glyph>
  )
}
export function IconChevron() {
  return (
    <Glyph>
      <path d="m9 6 6 6-6 6" />
    </Glyph>
  )
}
export function IconArrowUp() {
  return (
    <Glyph>
      <path d="M7 14l5-5 5 5" />
    </Glyph>
  )
}
export function IconArrowDown() {
  return (
    <Glyph>
      <path d="M7 10l5 5 5-5" />
    </Glyph>
  )
}
export function IconPerson() {
  return (
    <Glyph>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M6 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" />
    </Glyph>
  )
}
export function IconClock() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" />
    </Glyph>
  )
}
export function IconSun() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Glyph>
  )
}
export function IconMoon() {
  return (
    <Glyph>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </Glyph>
  )
}
