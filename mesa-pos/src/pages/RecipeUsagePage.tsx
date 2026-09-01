import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { buildRecipeUsage } from '../lib/recipeUsage'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

type StatusFilter = 'all' | 'active' | 'inactive'

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconRecipe() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 11h14M5 7h14M5 15h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="17" cy="15" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function IconPlate() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  )
}

function IconLeaf() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 20c6-1 10-5 11-11 0 0-4 0-7 3s-4 8-4 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 16c2-4 6-7 11-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10-10-4-4L4 16v4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m13 7 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function RecipeUsagePage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { dishes } = useMasters()
  const { ingredients, stock } = usePos()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const rows = useMemo(
    () => buildRecipeUsage(dishes, ingredients, stock),
    [dishes, ingredients, stock],
  )

  const activeCount = useMemo(() => rows.filter((r) => r.active).length, [rows])
  const inactiveCount = rows.length - activeCount

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter === 'active' && !row.active) return false
      if (statusFilter === 'inactive' && row.active) return false
      if (!q) return true
      if (row.dishName.toLowerCase().includes(q)) return true
      if (row.dishCode.toLowerCase().includes(q)) return true
      if (row.category.toLowerCase().includes(q)) return true
      return row.lines.some((line) => line.name.toLowerCase().includes(q))
    })
  }, [rows, query, statusFilter])

  const ingredientCount = useMemo(() => {
    const ids = new Set<string>()
    for (const row of rows) {
      for (const line of row.lines) ids.add(line.ingredientId)
    }
    return ids.size
  }, [rows])

  const lineCount = useMemo(
    () => rows.reduce((sum, row) => sum + row.lines.length, 0),
    [rows],
  )

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.setRecipeUsage} locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to={settingsHubPath('ingredients')} className="btn btn-ghost">
              Back
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-rec">
      <HubHeader closeTo={settingsHubPath('ingredients')} />

      <div className="rec-page-inner">
        <header className="rec-hero">
          <div className="rec-hero-brand">
            <span className="rec-hero-mark">
              <IconRecipe />
            </span>
            <div>
              <p className="rec-kicker">{t.ingredients}</p>
              <h1>{t.setRecipeUsage}</h1>
              <p>{t.recipeUsageHint}</p>
            </div>
          </div>
          <div className="rec-hero-stats">
            <span className="rec-stat tone-teal">
              <IconPlate />
              <strong className="mesa-ltr-nums">{rows.length}</strong>
              <em>{t.recipeUsageDishes}</em>
            </span>
            <span className="rec-stat tone-ocean">
              <IconLeaf />
              <strong className="mesa-ltr-nums">{ingredientCount}</strong>
              <em>{t.recipeUsageIngredients}</em>
            </span>
            <span className="rec-stat tone-amber">
              <IconRecipe />
              <strong className="mesa-ltr-nums">{lineCount}</strong>
              <em>{t.recipeUsageLines}</em>
            </span>
          </div>
          <div className="rec-hero-actions">
            <Link to="/masters?tab=dishes" className="rec-link-btn primary">
              <IconEdit /> {t.setMenuItemRecipes}
            </Link>
          </div>
        </header>

        <section className="rec-board">
          <div className="rec-toolbar">
            <label className="rec-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.recipeUsageSearch}
                aria-label={t.recipeUsageSearch}
              />
            </label>
            <div className="rec-filters" role="tablist" aria-label="Status filter">
              {(
                [
                  ['all', t.recipeUsageFilterAll, rows.length],
                  ['active', t.recipeUsageActive, activeCount],
                  ['inactive', t.recipeUsageInactive, inactiveCount],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className={`rec-filter tone-${id}${statusFilter === id ? ' on' : ''}`}
                  onClick={() => setStatusFilter(id)}
                >
                  {label}
                  <em className="mesa-ltr-nums">{count}</em>
                </button>
              ))}
            </div>
            <span className="rec-result-chip mesa-ltr-nums">
              {filtered.length} {t.recipeUsageShown.toLowerCase()}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="rec-empty">
              <span className="rec-empty-ico">
                <IconRecipe />
              </span>
              <strong>{rows.length ? t.recipeUsageNoMatch : t.recipeUsageEmpty}</strong>
              <p>{rows.length ? t.recipeUsageNoMatchHint : t.recipeUsageEmptyHint}</p>
              {!rows.length ? (
                <Link to="/masters?tab=dishes" className="rec-link-btn primary">
                  {t.setMenuItemRecipes}
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setQuery('')
                    setStatusFilter('all')
                  }}
                >
                  {t.recipeUsageClearFilters}
                </button>
              )}
            </div>
          ) : (
            <div className="rec-table-wrap">
              <table className="rec-table">
                <colgroup>
                  <col className="rec-col-dish" />
                  <col className="rec-col-cat" />
                  <col className="rec-col-ing" />
                  <col className="rec-col-status" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t.menuItem}</th>
                    <th>{t.recipeUsageCategory}</th>
                    <th>{t.recipeUsageRecipeCol}</th>
                    <th>{t.recipeUsageStatusCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.dishId} className={row.active ? '' : 'is-off'}>
                      <td>
                        <div className="rec-dish">
                          <span className="rec-dish-mark" aria-hidden>
                            {row.dishName.trim().charAt(0).toUpperCase() || '?'}
                          </span>
                          <div className="rec-dish-text">
                            <strong title={row.dishName}>{row.dishName}</strong>
                            <small className="mesa-ltr-nums">{row.dishCode}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="rec-cat">{row.category || '—'}</span>
                      </td>
                      <td>
                        <div className="rec-chips">
                          {row.lines.map((line, idx) => (
                            <span key={`${line.ingredientId}-${idx}`} className="rec-chip">
                              <em className="mesa-ltr-nums">
                                {line.qty} {line.unit}
                              </em>
                              <span>{line.name}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`rec-status${row.active ? ' on' : ''}`}>
                          {row.active ? t.recipeUsageActive : t.recipeUsageInactive}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <HubFooter backTo={settingsHubPath('ingredients')} backLabel={t.ingredients} />
    </div>
  )
}
