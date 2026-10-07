import type { ReactNode } from 'react'

export function QsIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="qs-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function IconBolt() {
  return (
    <QsIcon>
      <path d="M13 2 6 13h6l-1 9 7-11h-6l1-9Z" />
    </QsIcon>
  )
}

export function IconPlus() {
  return (
    <QsIcon>
      <path d="M12 5v14M5 12h14" />
    </QsIcon>
  )
}

export function IconSend() {
  return (
    <QsIcon>
      <path d="M4 12h12" />
      <path d="M13 7l5 5-5 5" />
      <path d="M4 7v10" />
    </QsIcon>
  )
}

export function IconPay() {
  return (
    <QsIcon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </QsIcon>
  )
}

export function IconUser() {
  return (
    <QsIcon>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
    </QsIcon>
  )
}

export function IconTable() {
  return (
    <QsIcon>
      <rect x="3" y="7" width="18" height="4" rx="1.5" />
      <path d="M6 11v7M18 11v7M10 11v4M14 11v4" />
    </QsIcon>
  )
}

export function IconNote() {
  return (
    <QsIcon>
      <path d="M7 4h8l2 2v14H7V4Z" />
      <path d="M9.5 10h5M9.5 13h5M9.5 16h3" />
    </QsIcon>
  )
}

export function IconBag() {
  return (
    <QsIcon>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </QsIcon>
  )
}

export function IconCancel() {
  return (
    <QsIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </QsIcon>
  )
}

export function IconMenu() {
  return (
    <QsIcon>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </QsIcon>
  )
}

export function IconTicket() {
  return (
    <QsIcon>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v1.2a1.8 1.8 0 0 0 0 3.6V16a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5v-7Z" />
      <path d="M12 8v8" />
    </QsIcon>
  )
}

export function IconTrash() {
  return (
    <QsIcon>
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M7 7l.6 12h8.8L17 7" />
    </QsIcon>
  )
}
