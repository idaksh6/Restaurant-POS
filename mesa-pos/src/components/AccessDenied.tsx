import { Link } from 'react-router-dom'
import { useI18n } from '../locale/i18n'

type Props = {
  pathname: string
}

export default function AccessDenied({ pathname }: Props) {
  const { t } = useI18n()

  const isUsers = pathname.startsWith('/settings/users')
  const isRoles = pathname.startsWith('/settings/roles')
  const isBackOffice = pathname.startsWith('/back-office')
  const isSettings = pathname.startsWith('/settings')

  const title = isUsers || isRoles
    ? t.accessDeniedUsers
    : isBackOffice
      ? t.accessDeniedBackOffice
      : isSettings
        ? t.accessDeniedSettings
        : t.accessDeniedGeneric

  const hint = isUsers || isRoles
    ? t.accessDeniedUsersHint
    : isBackOffice
      ? t.accessDeniedBackOfficeHint
      : isSettings
        ? t.accessDeniedSettingsHint
        : t.accessDeniedGenericHint

  const backTo = isUsers || isRoles ? '/settings?tab=user' : isSettings ? '/settings' : '/'
  const backLabel =
    isUsers || isRoles ? t.backToUserSettings : isSettings ? t.backToSettings : t.mainMenu

  return (
    <div className="panel floor-panel access-denied">
      <div className="ticket-empty">
        <strong>{t.accessDenied}</strong>
        <p>{title}</p>
        <p className="access-denied-hint">{hint}</p>
        <div className="access-denied-actions">
          <Link to={backTo} className="btn btn-ghost">
            {backLabel}
          </Link>
          <Link to="/" className="btn btn-teal">
            {t.mainMenu}
          </Link>
        </div>
      </div>
    </div>
  )
}
