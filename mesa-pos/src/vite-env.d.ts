/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_ZATCA_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type MesaDisk = {
  loadDexie: () => unknown
  saveDexie: (dump: unknown) => void
}

type MesaShell = {
  openKeyboard: () => Promise<boolean>
}

interface Window {
  mesaDisk?: MesaDisk
  mesaShell?: MesaShell
  __mesaFlushDexie?: () => Promise<void>
}
