import { useState } from 'react'
import {
  AGENT_DOWNLOAD_URL,
  DEFAULT_AGENT_URL,
  agentUrl,
  friendlyPrintError,
  setAgentUrl,
  type AgentError,
  type AgentStatus,
} from '../../hardware/printAgent'
import PrinterStatusBadge from './PrinterStatusBadge'

/** Compact strip shown above the printer list when the agent is not reachable. */
export function AgentBanner({ error, onRetry, checking }: { error: AgentError | null; onRetry: () => void; checking: boolean }) {
  if (!error) return null
  const f = friendlyPrintError(error)
  return (
    <div className="zk-pm-banner" role="status">
      <div>
        <strong>{f.title}</strong>
        <span>USB / LAN / Wi-Fi printers need the Isarva POS Print Agent on this computer. {f.hint}</span>
      </div>
      <div className="zk-pm-banner-actions">
        <a className="zk-pm-btn" href={AGENT_DOWNLOAD_URL} download>Download agent</a>
        <button type="button" className="zk-pm-btn primary" onClick={onRetry} disabled={checking}>
          {checking ? 'Checking…' : 'Retry'}
        </button>
      </div>
    </div>
  )
}

export default function AgentPanel({
  agent,
  agentError,
  checking,
  onRetry,
}: {
  agent: AgentStatus | null
  agentError: AgentError | null
  checking: boolean
  onRetry: () => void
}) {
  const [url, setUrl] = useState(agentUrl())
  const [saved, setSaved] = useState(false)
  const online = agent?.printers.filter((p) => p.state === 'online').length ?? 0

  return (
    <div className="zk-pm-agent">
      <section className="zk-pm-card">
        <div className="zk-pm-card-head">
          <h3>Isarva POS Print Agent</h3>
          <button type="button" className="zk-pm-btn" onClick={onRetry} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
        <div className="zk-pm-kv">
          <span>Agent on this computer</span>
          {agent ? (
            <PrinterStatusBadge tone="online" label={`Running · v${agent.version}`} />
          ) : (
            <PrinterStatusBadge tone={checking ? 'warn' : 'offline'} label={checking ? 'Connecting' : friendlyPrintError(agentError ?? undefined).title} />
          )}
        </div>
        {agent ? (
          <>
            <div className="zk-pm-kv">
              <span>Printers known to the agent</span>
              <strong>{agent.printers.length} ({online} online)</strong>
            </div>
            <div className="zk-pm-kv">
              <span>Failed jobs kept for retry</span>
              <strong>{agent.failedJobs}</strong>
            </div>
          </>
        ) : null}
      </section>

      <section className="zk-pm-card">
        <h3>Set up on a POS computer</h3>
        <ol className="zk-pm-steps-list">
          <li>
            <a href={AGENT_DOWNLOAD_URL} download>Download the Print Agent installer</a> and run it on every Windows computer that prints.
          </li>
          <li>It starts automatically with Windows and sits in the system tray (bottom-right, near the clock).</li>
          <li>
            When the browser asks to <em>access apps / devices on your local network</em>, click <strong>Allow</strong>. If you blocked
            it, open the padlock next to the address bar → Site settings → Local network access → Allow.
          </li>
          <li>Add printers here (Printers tab) and use <strong>Test print</strong> to confirm.</li>
        </ol>
      </section>

      <section className="zk-pm-card">
        <h3>Advanced</h3>
        <label className="zk-pm-field">
          <span>Agent address on this computer</span>
          <div className="zk-pm-inline">
            <input className="search" value={url} onChange={(e) => { setUrl(e.target.value); setSaved(false) }} spellCheck={false} />
            <button
              type="button"
              className="zk-pm-btn"
              onClick={() => {
                setAgentUrl(url)
                setUrl(agentUrl())
                setSaved(true)
                onRetry()
              }}
            >
              Save
            </button>
          </div>
          <small className="zk-pm-muted">
            Default {DEFAULT_AGENT_URL}. Only change this if support asked you to. {saved ? 'Saved.' : ''}
          </small>
        </label>
      </section>
    </div>
  )
}
