import { useState } from 'react'
import type { KitchenPriority } from '../data/mock'

type Props = {
  pendingCount: number
  onClose: () => void
  onSend: (priority: KitchenPriority) => void
}

export default function SendOrdersModal({ pendingCount, onClose, onSend }: Props) {
  const [priority, setPriority] = useState<KitchenPriority>('normal')

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="section-head">
          <h2>Send KOT</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="modal-lead">
          {pendingCount} unsent item{pendingCount === 1 ? '' : 's'} will print as KOT / kitchen display.
        </p>
        <div className="priority-row">
          {(['high', 'normal', 'low'] as KitchenPriority[]).map((level) => (
            <button
              key={level}
              type="button"
              className={`btn ${priority === level ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setPriority(level)}
            >
              {level}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-teal" onClick={() => onSend(priority)}>
          Confirm send
        </button>
      </div>
    </div>
  )
}
