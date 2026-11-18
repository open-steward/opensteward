/**
 * Sorting and per-column filtering for the admin's list tables.
 *
 * One module owns the whole contract — `?sort=&dir=&f_<key>=&page=` — so that
 * fifteen tables cannot drift into fifteen conventions, which is what happened
 * to pagination: five views hand-roll `filterQs` and every admin-api route
 * re-implements its own page clamping, audit's copy having already lost its
 * lower bound.
 *
 * Dependency-free on purpose, like `helpers.ts` beside it: EJS renders
 * synchronously and any heavy import here is p99 page-load jitter.
 */

/** A free-text box, or a select over a known set of values. */
export type FilterKind = 'text' | { type: 'enum'; options: Array<{ value: string; label: string }> }

export interface ColumnSpec {
  /** Manifest key. Appears in the URL as `sort=<key>` and `f_<key>=`. */
  key: string
  /** Visible header text. Empty for an actions column. */
  header: string
  sortable?: boolean
  filter?: FilterKind
  /**
   * The value this column sorts and filters on, read from a row.
   * Required whenever `sortable` or `filter` is set.
   */
  get?: (row: any) => unknown
  /**
   * A pre-existing query param this column supersedes. Honoured on read so
   * bookmarked and documented URLs keep working; never emitted.
   */
  legacy?: string
  /** Extra attributes for the header `<th>`, e.g. a width. */
  thAttrs?: string
  /**
   * Processed for sort/filter like any other column, but never rendered as a
   * `<th>` — for a synthetic column with no cell of its own, e.g. a legacy
   * search param that combined two real columns (label-or-url) before this
   * table split them. Giving that alias its OWN column, rather than
   * reusing one of the two real columns' `get`, is what keeps the real
   * columns honest per THE RULE THAT MATTERS MOST: a `label` column must
   * filter on label alone, or an operator typing what the Label cell shows
   * would also match on URL content that never appears in that cell.
   */
  hidden?: boolean
  /**
   * A hidden column whose control the view renders itself.
   *
   * `hidden` alone means "no <th>, so _table-filters-form.ejs emits a hidden
   * input to carry the value across a submit". That is right for a synthetic
   * alias with no control at all, and wrong for a column the view renders its
   * own control for — /audit's from/to date range, which cannot fit the
   * one-control-per-column filter row. Without this the value submits twice:
   * once from the hidden mirror, once from the visible control.
   */
  rendered?: boolean
}

export interface TableSpec {
  /** DOM id of the filter form. Must be unique on the page. */
  id: string
  /** Where the form submits and the sort links point. */
  baseUrl: string
  columns: ColumnSpec[]
  /** Query params to carry through sorting and filtering (`tab`, an id, …). */
  preserve?: string[]
}

export interface TableState {
  sort: string | null
  dir: 'asc' | 'desc'
  /** Keyed by column key. Only non-blank, known columns appear. */
  filters: Record<string, string>
  page: number
  /** The `preserve` params that were present. */
  extra: Record<string, string>
}

/**
 * One value from a query field.
 *
 * Fastify 5's default parser yields an ARRAY for a repeated key, so
 * `?search=a&search=b` reaches a route as `['a','b']` and the universal
 * `request.query.x?.trim()` throws — a 500 reachable today on nine pages by
 * hand-editing a URL. The last value wins, which is what a browser sends when
 * a form has two controls of one name.
 *
 * Exported because routes need it too, not only `parseTableQuery`: /audit's
 * export handler reads the LEGACY param names directly (they never go through
 * a TableSpec) and has the same array hazard.
 */
export function one(value: unknown): string {
  if (Array.isArray(value)) return one(value[value.length - 1])
  return typeof value === 'string' ? value : ''
}

export function parseTableQuery(query: unknown, spec: TableSpec): TableState {
  const q = (query ?? {}) as Record<string, unknown>

  const sortable = new Set(spec.columns.filter((c) => c.sortable).map((c) => c.key))
  const requested = one(q.sort).trim()
  // An unknown key is ignored rather than refused: it arrives from a stale
  // bookmark or a hand-edited URL, and a table that renders in its default
  // order is a better answer than a 400.
  const sort = sortable.has(requested) ? requested : null
  const dir = one(q.dir).trim() === 'desc' ? 'desc' : 'asc'

  const filters: Record<string, string> = {}
  for (const col of spec.columns) {
    if (!col.filter) continue
    const explicit = one(q[`f_${col.key}`]).trim()
    // The explicit form wins: a URL carrying both is one someone edited, and
    // the new name is the one they edited.
    const value = explicit || (col.legacy ? one(q[col.legacy]).trim() : '')
    if (value) filters[col.key] = value
  }

  const extra: Record<string, string> = {}
  for (const key of spec.preserve ?? []) {
    const value = one(q[key]).trim()
    if (value) extra[key] = value
  }

  const page = Math.max(1, parseInt(one(q.page) || '1', 10) || 1)

  return { sort, dir, filters, page, extra }
}

/** Normalise a cell value for comparison. `null`/`undefined`/'' all read as absent. */
function cell(col: ColumnSpec, row: unknown): unknown {
  const value = col.get ? col.get(row) : undefined
  return value === null || value === undefined || value === '' ? undefined : value
}

/**
 * Filter, then sort, a table's rows in memory.
 *
 * Used by the ten tables that already receive their complete dataset in the
 * admin route, exactly as `platforms.ts` already filters in-process. Tables
 * whose rows are paginated upstream do this work at the layer that holds the
 * whole set instead — sorting a page would reorder a fraction of the rows while
 * looking authoritative.
 */
export function applyTableQuery<T>(rows: T[], state: TableState, spec: TableSpec): T[] {
  const byKey = new Map(spec.columns.map((c) => [c.key, c]))

  let out = rows
  for (const [key, needle] of Object.entries(state.filters)) {
    const col = byKey.get(key)
    if (!col?.filter) continue
    // Enum columns match exactly; a substring match would make one option a
    // prefix of another and quietly widen the result.
    const exact = typeof col.filter === 'object' && col.filter.type === 'enum'
    const wanted = needle.toLowerCase()
    out = out.filter((row) => {
      const value = cell(col, row)
      if (value === undefined) return false
      const text = String(value).toLowerCase()
      return exact ? text === wanted : text.includes(wanted)
    })
  }

  const col = state.sort ? byKey.get(state.sort) : undefined
  if (!col?.sortable) return out === rows ? [...rows] : out

  const sign = state.dir === 'desc' ? -1 : 1
  // Copied before sorting: `rows` belongs to the caller, and several routes
  // pass an array they go on to use for a count.
  return [...out].sort((a, b) => {
    const av = cell(col, a)
    const bv = cell(col, b)
    // Absent values sort last in BOTH directions — a missing date is unknown,
    // not earliest, so `sign` deliberately does not apply here.
    if (av === undefined && bv === undefined) return 0
    if (av === undefined) return 1
    if (bv === undefined) return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign
    return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * sign
  })
}

const enc = encodeURIComponent

function pairs(state: TableState, spec: TableSpec): string[] {
  const out: string[] = []
  // `dir` only means something alongside a sort, so it travels with it.
  if (state.sort) out.push(`sort=${enc(state.sort)}`, `dir=${enc(state.dir)}`)
  // Column order, not insertion order, so a URL is stable across renders and
  // diffs cleanly in a bug report.
  for (const col of spec.columns) {
    const value = state.filters[col.key]
    if (value) out.push(`f_${enc(col.key)}=${enc(value)}`)
  }
  for (const key of spec.preserve ?? []) {
    const value = state.extra[key]
    if (value) out.push(`${enc(key)}=${enc(value)}`)
  }
  return out
}

/**
 * The table's state as a query string, for `views/_pagination.ejs`.
 *
 * Its `filterQs` contract is exact: already encoded, `&`-joined, no leading
 * separator, and NO `page` — the partial appends `&page=N` itself. Five views
 * hand-roll this today, and forgetting one param silently widens the result set
 * on page 2.
 */
export function tableQs(state: TableState, spec: TableSpec): string {
  return pairs(state, spec).join('&')
}

/**
 * Where a sort header points.
 *
 * A plain link, because `no-interpolation-in-inline-js.test.ts` bans an
 * `on*="…<%= %>…"` handler — and because a GET navigation should be
 * bookmarkable and middle-clickable anyway. It carries the SUBMITTED filters,
 * so clicking a header discards filter text typed but not yet applied; that
 * follows from Enter-to-apply and matches the forms already on these pages.
 */
export function sortHref(state: TableState, spec: TableSpec, key: string): string {
  const active = state.sort === key
  const next: TableState = {
    ...state,
    sort: key,
    // Flip only the column already sorted. A fresh column starts ascending
    // rather than inheriting a direction the operator chose for something else.
    dir: active && state.dir === 'asc' ? 'desc' : active ? 'asc' : 'asc',
    // Belt and braces, and deliberately unobservable: `pairs()` never emits
    // `page`, so this cannot change the href today — mutating it to
    // `state.page` leaves all 1281 admin tests green. It is kept, and labelled,
    // because the INTENT is load-bearing: clicking a sort header must land on
    // page 1, not page 7 of an order that no longer exists. If `pairs()` ever
    // learns to emit `page`, this is already correct; without the note it
    // reads as a live guard that a reader would trust.
    page: 1,
  }
  const qs = pairs(next, spec).join('&')
  return qs ? `${spec.baseUrl}?${qs}` : spec.baseUrl
}
