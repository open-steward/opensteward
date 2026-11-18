/**
 * One upstream page of a Wish v3 list, walked by its documented timestamp
 * keyset.
 *
 * The v3 reference's "Pagination" section: "All bulk-fetching API methods that
 * return lists of resource support pagination. These methods commonly take at
 * least 3 parameters: `limit`, `{attribute}_min`, `{attribute}_max`." Its own
 * example pages a list sorted descending by a timestamp and asks for the next
 * page with the last row's timestamp as `{attribute}_max`: "your subsequent
 * request can be `…&created_at_max={penalty_foo.create_at}&sort_by=…desc` to
 * fetch the next page of list." GET /api/v3/products and GET /api/v3/orders
 * take no offset, page number or cursor; both take `updated_at_max` and a
 * `sort_by` whose default is "updated_at.desc".
 *
 * The reference says only that `id_min`/`id_max` "are inclusive"; whether
 * `updated_at_max` includes its bound is not documented, and neither is the
 * precision the orders list keeps (the product list's `updated_at_max` says
 * "precision up to 'millisecond'"). So the next page is asked for at a bound
 * strictly past the last row's `updated_at` that reaches every row sharing
 * it under any of those readings: one millisecond past it (`step: 'ms'`,
 * where millisecond precision is documented), or the start of the next whole
 * second (`step: 's'`, where a server that kept only seconds and excluded
 * its bound would otherwise skip the rest of that second). Rows already
 * served at or before that bound can come back; they are carried in the
 * cursor and dropped. A full page that yields no new row means at least
 * `limit` rows fall inside that overlap; the same request is then repeated
 * at a doubled `limit`, up to the endpoint's documented maximum, to get past
 * them. Past the maximum the walk cannot pass them, and says so instead of
 * looping. The escalation depends only on the cursor and the rows, so a
 * cursor still replays the same page.
 *
 * No end signal is documented beyond the rows themselves, so a page shorter
 * than the `limit` sent ends the list.
 */

/** How far past the last row's `updated_at` the next page's `updated_at_max` is set. */
export type KeysetStep = 'ms' | 's'

/** A replayable position: the `updated_at_max` to send and rows already served at or before it. */
export interface KeysetCursor {
  max: string
  /** `[id, updated_at in ms]` of rows already served that the next request can return again. */
  seen: Array<[string, number]>
}

export interface KeysetRow {
  id?: string
  updated_at?: string
}

export interface KeysetPage<R> {
  items: R[]
  next?: KeysetCursor
}

function stamp(row: KeysetRow, what: string): number {
  const ms = row.updated_at === undefined ? NaN : Date.parse(row.updated_at)
  if (!Number.isFinite(ms)) {
    throw new Error(
      `Wish ${what}: row ${row.id ?? '(no id)'} has no parseable updated_at to page past`,
    )
  }
  return ms
}

function rowId(row: KeysetRow, what: string): string {
  if (typeof row.id !== 'string' || row.id === '') {
    throw new Error(`Wish ${what}: a listed row has no id`)
  }
  return row.id
}

/**
 * Fetch the page that `cursor` starts (the first page when undefined).
 *
 * `request(query)` sends the list request with `query` merged into the
 * method's own filters and returns the envelope's `data` rows.
 */
export async function fetchKeysetPage<R extends KeysetRow>(
  what: string,
  pageLimit: number,
  maxLimit: number,
  step: KeysetStep,
  cursor: KeysetCursor | undefined,
  request: (query: Record<string, unknown>) => Promise<R[]>,
): Promise<KeysetPage<R>> {
  const skip = new Set((cursor?.seen ?? []).map(([id]) => id))
  let limit = pageLimit
  let raw: R[]
  let items: R[]
  for (;;) {
    const query: Record<string, unknown> = { limit, sort_by: 'updated_at.desc' }
    if (cursor) query['updated_at_max'] = cursor.max
    raw = await request(query)
    if (!Array.isArray(raw)) {
      throw new Error(`Wish ${what}: the list response's data is not an array`)
    }
    items = raw.filter((r) => !skip.has(rowId(r, what)))
    if (raw.length < limit || items.length > 0) break
    if (limit >= maxLimit) {
      throw new Error(
        `Wish ${what}: more than ${maxLimit} rows fall within one updated_at_max step of ` +
          `${raw[raw.length - 1]!.updated_at}; the documented keyset cannot page past them`,
      )
    }
    limit = Math.min(limit * 2, maxLimit)
  }
  if (raw.length < limit) return { items }

  const floor = stamp(raw[raw.length - 1]!, what)
  const max = step === 'ms' ? floor + 1 : (Math.floor(floor / 1000) + 1) * 1000
  // Every row served so far is at or after `floor`. Those at or before `max`
  // can be returned again: every row on this page, and any served earlier
  // that this page's order happened to leave out.
  const seen = new Map<string, number>()
  for (const [id, ms] of cursor?.seen ?? []) if (ms <= max) seen.set(id, ms)
  for (const r of raw) {
    const ms = stamp(r, what)
    if (ms <= max) seen.set(rowId(r, what), ms)
  }
  return { items, next: { max: new Date(max).toISOString(), seen: [...seen] } }
}
