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
  const isBarcode = pathname.startsWith('/barcode')
  const isReports = pathname.startsWith('/reports')
  const isAccounts = pathname.startsWith('/accounts') || pathname.startsWith('/expenses')

  const title = isUsers || isRoles
    ? t.accessDeniedUsers
    : isBackOffice
      ? t.accessDeniedBackOffice
      : isSettings
        ? t.accessDeniedSettings
        : isBarcode
          ? t.accessDeniedBarcode
          : isReports
            ? t.accessDeniedReports
            : isAccounts
              ? t.accessDeniedAccounts
              : t.accessDeniedGeneric

  const hint = isUsers || isRoles
    ? t.accessDeniedUsersHint
    : isBackOffice
      ? t.accessDeniedBackOfficeHint
      : isSettings
        ? t.accessDeniedSettingsHint
        : isBarcode
          ? t.accessDeniedBarcodeHint
          : isReports
            ? t.accessDeniedReportsHint
            : isAccounts
              ? t.accessDeniedAccountsHint
              : t.accessDeniedGenericHint

  const backTo = isUsers || isRoles ? '/settings?tab=user' : isSettings ? '/settings' : '/'
  const backLabel =
    isUsers || isRoles ? t.backToUserSettings : isSettings ? t.backToSettings : t.mainMenu
  const showSecondaryHome = backTo !== '/'

  return (
    <div className="zk-access-denied" role="alert">
      <div className="zk-access-denied-card">
        <span className="zk-access-denied-mark" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
        </span>
        <strong className="zk-access-denied-title">{t.accessDenied}</strong>
        <p className="zk-access-denied-lead">{title}</p>
        <p className="zk-access-denied-hint">{hint}</p>
        <div className="zk-access-denied-actions">
          {showSecondaryHome ? (
            <>
              <Link to={backTo} className="btn btn-ghost zk-access-denied-btn">
                {backLabel}
              </Link>
              <Link to="/" className="btn btn-teal zk-access-denied-btn">
                {t.mainMenu}
              </Link>
            </>
          ) : (
            <Link to="/" className="btn btn-teal zk-access-denied-btn">
              {t.mainMenu}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
