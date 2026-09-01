/** Top-down dining table. Chair count follows `seats` (2, 4, 6, or 8). */
export default function TableIcon({
  seats = 4,
  busy = false,
  className,
}: {
  seats?: number
  busy?: boolean
  className?: string
}) {
  const n = seats <= 2 ? 2 : seats <= 4 ? 4 : seats <= 6 ? 6 : 8
  return (
    <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden>
      {n === 2 ? (
        <>
          <rect className="table-icon-chair" x="30" y="4" width="20" height="12" rx="6" />
          <rect className="table-icon-chair" x="30" y="64" width="20" height="12" rx="6" />
          <ellipse className="table-icon-top" cx="40" cy="40" rx="20" ry="20" />
          <ellipse className="table-icon-inner" cx="40" cy="40" rx="13.5" ry="13.5" />
          {busy ? (
            <>
              <circle className="table-icon-plate" cx="40" cy="33" r="4" />
              <circle className="table-icon-plate" cx="40" cy="47" r="4" />
            </>
          ) : (
            <ellipse className="table-icon-shine" cx="34" cy="34" rx="5" ry="3.5" />
          )}
        </>
      ) : null}
      {n === 4 ? (
        <>
          <rect className="table-icon-chair" x="30" y="3" width="20" height="12" rx="6" />
          <rect className="table-icon-chair" x="30" y="65" width="20" height="12" rx="6" />
          <rect className="table-icon-chair" x="3" y="30" width="12" height="20" rx="6" />
          <rect className="table-icon-chair" x="65" y="30" width="12" height="20" rx="6" />
          <rect className="table-icon-top" x="20" y="20" width="40" height="40" rx="12" />
          <rect className="table-icon-inner" x="27" y="27" width="26" height="26" rx="8" />
          {busy ? (
            <>
              <circle className="table-icon-plate" cx="33" cy="40" r="3.6" />
              <circle className="table-icon-plate" cx="47" cy="40" r="3.6" />
            </>
          ) : (
            <ellipse className="table-icon-shine" cx="32" cy="32" rx="6" ry="4" />
          )}
        </>
      ) : null}
      {n === 6 ? (
        <>
          <rect className="table-icon-chair" x="16" y="5" width="16" height="11" rx="5.5" />
          <rect className="table-icon-chair" x="48" y="5" width="16" height="11" rx="5.5" />
          <rect className="table-icon-chair" x="16" y="64" width="16" height="11" rx="5.5" />
          <rect className="table-icon-chair" x="48" y="64" width="16" height="11" rx="5.5" />
          <rect className="table-icon-chair" x="3" y="30" width="11" height="20" rx="5.5" />
          <rect className="table-icon-chair" x="66" y="30" width="11" height="20" rx="5.5" />
          <rect className="table-icon-top" x="16" y="22" width="48" height="36" rx="18" />
          <rect className="table-icon-inner" x="23" y="28" width="34" height="24" rx="12" />
          {busy ? (
            <>
              <circle className="table-icon-plate" cx="32" cy="40" r="3.4" />
              <circle className="table-icon-plate" cx="48" cy="40" r="3.4" />
            </>
          ) : (
            <ellipse className="table-icon-shine" cx="30" cy="34" rx="7" ry="4" />
          )}
        </>
      ) : null}
      {n === 8 ? (
        <>
          <rect className="table-icon-chair" x="12" y="5" width="14" height="10" rx="5" />
          <rect className="table-icon-chair" x="33" y="5" width="14" height="10" rx="5" />
          <rect className="table-icon-chair" x="54" y="5" width="14" height="10" rx="5" />
          <rect className="table-icon-chair" x="12" y="65" width="14" height="10" rx="5" />
          <rect className="table-icon-chair" x="33" y="65" width="14" height="10" rx="5" />
          <rect className="table-icon-chair" x="54" y="65" width="14" height="10" rx="5" />
          <rect className="table-icon-chair" x="3" y="30" width="10" height="20" rx="5" />
          <rect className="table-icon-chair" x="67" y="30" width="10" height="20" rx="5" />
          <rect className="table-icon-top" x="15" y="22" width="50" height="36" rx="12" />
          <rect className="table-icon-inner" x="22" y="28" width="36" height="24" rx="8" />
          {busy ? (
            <>
              <circle className="table-icon-plate" cx="30" cy="40" r="3.2" />
              <circle className="table-icon-plate" cx="40" cy="40" r="3.2" />
              <circle className="table-icon-plate" cx="50" cy="40" r="3.2" />
            </>
          ) : (
            <ellipse className="table-icon-shine" cx="28" cy="34" rx="8" ry="4" />
          )}
        </>
      ) : null}
    </svg>
  )
}
