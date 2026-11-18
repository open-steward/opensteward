/**
 * Walk an Ozon list that only accepts a bounded date window back through its
 * whole history, one sync page at a time.
 *
 * `/v3/posting/fbs/list` takes a `since`/`to` of at most one year and
 * `/v3/finance/transaction/list` a `from`/`to` of at most one month. The sync
 * worker asks only for `page`, so without a caller window the adapter walks
 * back from now in consecutive UTC calendar windows (years or months) down to
 * `OZON_HISTORY_FLOOR`. Each call answers ONE sync page; the shared cursor
 * pager (`pageByCursor`) remembers the cursor that starts every page, so page
 * N continues exactly where page N-1 stopped.
 *
 * The cursor is composite: the end of the current window, the position inside
 * it (offset for postings, page for finance), and the ids handed out on the
 * last non-empty page.
 *
 * Adjacent windows share their boundary instant (`to` of the older window is
 * `since` of the newer). Ozon does not document whether the bounds are
 * inclusive, and a gap would lose rows while an overlap only repeats them, so
 * the windows overlap. A repeated row is dropped when it is one the previous
 * sync page already returned. Without that, a row that is alone on both sides
 * of a boundary would make two consecutive sync pages identical, which the
 * sync worker rejects as an adapter ignoring `page`.
 *
 * Windows that yield nothing new are skipped within the same call, so a sync
 * page is not empty while history remains, up to `maxWindows` per call.
 */

export type WindowUnit = 'year' | 'month'

export interface HistoryWindow {
  since: string
  to: string
}

export interface HistoryCursor {
  /** End of the current window (ISO 8601). */
  end: string
  /** Offset (postings) or 1-based page (finance) inside the window. */
  position: number
  /** Ids returned on the last non-empty sync page. */
  lastIds?: string[]
}

export interface WalkOptions<T> {
  cursor: HistoryCursor | undefined
  unit: WindowUnit
  /** Oldest instant the walk reaches (ISO 8601). */
  floor: string
  /** Position that starts a window: 0 for an offset, 1 for a page. */
  firstPosition: number
  /** Most requests one call may make while it finds nothing new. */
  maxWindows: number
  idOf: (row: T) => string
  /** One upstream page; `nextPosition` is undefined once the window is exhausted. */
  fetchWindow: (window: HistoryWindow, position: number) => Promise<{ rows: T[]; nextPosition?: number }>
}

function startOfUnit(ms: number, unit: WindowUnit): number {
  const d = new Date(ms)
  return unit === 'year'
    ? Date.UTC(d.getUTCFullYear(), 0, 1)
    : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

/**
 * The window that ends at `end`: it starts at the calendar year or month
 * holding the instant just before `end`, and never before the floor.
 */
export function windowEndingAt(end: string, unit: WindowUnit, floor: string): HistoryWindow {
  const endMs = Date.parse(end)
  const sinceMs = Math.max(Date.parse(floor), startOfUnit(endMs - 1, unit))
  return { since: new Date(sinceMs).toISOString(), to: new Date(endMs).toISOString() }
}

/** One sync page of a backward walk, in the shape `pageByCursor` expects. */
export async function walkHistoryPage<T>(
  opts: WalkOptions<T>,
): Promise<{ items: T[]; next?: HistoryCursor }> {
  const floorMs = Date.parse(opts.floor)
  let cursor: HistoryCursor = opts.cursor ?? {
    end: new Date().toISOString(),
    position: opts.firstPosition,
  }

  for (let requests = 1; ; requests++) {
    const window = windowEndingAt(cursor.end, opts.unit, opts.floor)
    const page = await opts.fetchWindow(window, cursor.position)
    const alreadyReturned = new Set(cursor.lastIds ?? [])
    const rows = page.rows.filter((row) => !alreadyReturned.has(opts.idOf(row)))

    let next: HistoryCursor | undefined
    if (page.nextPosition !== undefined) {
      next = { end: cursor.end, position: page.nextPosition }
    } else if (Date.parse(window.since) > floorMs) {
      next = { end: window.since, position: opts.firstPosition }
    }

    if (rows.length > 0) {
      return { items: rows, next: next && { ...next, lastIds: rows.map(opts.idOf) } }
    }
    if (next === undefined) return { items: [] }
    // Nothing new: keep guarding against the page the worker last received.
    if (cursor.lastIds) next.lastIds = cursor.lastIds
    if (requests >= opts.maxWindows) return { items: [], next }
    cursor = next
  }
}
