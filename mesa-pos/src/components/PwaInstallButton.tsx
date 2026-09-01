import { useEffect, useState } from 'react'
import { useI18n } from '../locale/i18n'
import { canInstallPwa, onPwaInstallChange, promptPwaInstall } from '../pwa/install'

export default function PwaInstallButton({ className = 'btn' }: { className?: string }) {
  const { t } = useI18n()
  const [available, setAvailable] = useState(() => canInstallPwa())

  useEffect(() => onPwaInstallChange(() => setAvailable(canInstallPwa())), [])

  if (!available) return null

  return (
    <button type="button" className={className} onClick={() => void promptPwaInstall()}>
      {t.installTill}
    </button>
  )
}
