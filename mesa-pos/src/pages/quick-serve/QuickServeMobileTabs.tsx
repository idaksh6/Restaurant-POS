import { money } from '../../data/mock'
import { IconMenu, IconTicket } from './QuickServeIcons'
import type { QuickServeMobileTab } from './useQuickServeLayout'

type Props = {
  tab: QuickServeMobileTab
  lineCount: number
  total: number
  onChange: (tab: QuickServeMobileTab) => void
}

export default function QuickServeMobileTabs({ tab, lineCount, total, onChange }: Props) {
  return (
    <div className="qs-mobile-tabs" role="tablist" aria-label="Quick serve views">
      <button
        type="button"
        role="tab"
        id="qs-tab-menu"
        aria-selected={tab === 'menu'}
        aria-controls="qs-panel-menu"
        className={tab === 'menu' ? 'on' : ''}
        onClick={() => onChange('menu')}
      >
        <IconMenu />
        Menu
      </button>
      <button
        type="button"
        role="tab"
        id="qs-tab-ticket"
        aria-selected={tab === 'ticket'}
        aria-controls="qs-panel-ticket"
        className={tab === 'ticket' ? 'on' : ''}
        onClick={() => onChange('ticket')}
      >
        <IconTicket />
        Ticket
        {lineCount > 0 ? (
          <span className="qs-mobile-tabs-badge" aria-hidden>
            {lineCount}
          </span>
        ) : null}
        {lineCount > 0 ? (
          <span className="qs-mobile-tabs-meta">{money(total)}</span>
        ) : null}
      </button>
    </div>
  )
}
