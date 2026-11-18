/**
 * Serve the caller's pages from rows an adapter fetched, when one upstream
 * page is not one caller page.
 *
 * The router and the sync worker ask for `{ page, limit }` and expect page N
 * to be rows [(N-1)×limit, N×limit). Many upstreams cannot answer that
 * directly:
 *
 *   - a fixed or minimum batch: Salesforce's SOQL batches are 200–2,000 rows
 *     whatever the caller asked for, so page 1 at `limit=10` came back as 200
 *     rows, the router kept 10, and page 2 started at row 200;
 *   - rows flattened out of a parent: Shopify's fulfillments come out of pages
 *     of orders, 0 or 40 to a page, so a "page" was whatever one page of
 *     orders happened to hold;
 *   - several endpoints streamed as one list (Salesforce Tasks then Events,
 *     Shopify custom then smart collections);
 *   - no paging at all: the whole collection in one response.
 *
 * `pageLocally` (in `router/list-envelope.ts`) handles the last case: slice
 * the whole collection. {@link pageByRows} handles the rest: walk the upstream
 * pages, count rows, and cut exactly the caller's rows out of them, reporting
 * `hasMore` exactly. Both report `pagedLocally` through the page sink, so the
 * paging-contract gate, which compares the requests behind two caller pages,
 * knows those requests are not meant to move with `page`.
 *
 * ## The memo
 *
 * Per key, `marks[j]` records where upstream page `j` starts: its row offset
 * in the flattened stream and the cursor that fetches it. `marks[0]` is
 * `{ offset: 0, cursor: undefined }`. Offsets never decrease; an empty page
 * shares its offset with the next. Marks do not depend on the caller's
 * `limit`, so walks at different page sizes share them when the key leaves it
 * out. The key must identify the connection, and include every filter and
 * the UPSTREAM page size, because a cursor minted under one is a different
 * position under another. Where the upstream page is sized from the caller's
 * limit, that size is in the key and a walk at another limit gets its own.
 *
 * To serve rows [lo, hi): start at the last mark at or before `lo`, fetch
 * forward until `hi` rows are covered or the chain ends. A page that ends
 * exactly on an upstream boundary peeks at the next upstream page (walking any
 * empty ones), so `hasMore` is exact rather than a guess from a full page.
 * The last upstream page fetched is kept in a one-page slot, so the next
 * caller page (and the page after a peek) continues from it without a request.
 * A sequential walk therefore costs one request per upstream page, whatever
 * the caller's page size.
 *
 * The slot holds ROWS, fetched with one connection's credentials. That is why
 * the key must identify the connection and not only the account: two users of
 * one Salesforce org see different records, and a slot shared between them
 * would hand one user's rows to the other without a request under their own
 * token. `connectionScope` in `cursor-pager.ts` builds such a scope.
 *
 * Page 1 is always read afresh from the start of the chain. It never comes
 * from the slot or from the recorded end of an earlier walk, so a collection
 * that was empty, or whose first pages were, shows new rows on the next read.
 * One exception: a page-1 call that failed (a budget exhausted on a sparse
 * list, an upstream error) is resumed by a page-1 retry within the TTL, from
 * the last empty page it reached, so a retry makes progress instead of
 * repeating the same walk.
 *
 * ## When the collection changes
 *
 * Marks are positions in a live collection. A refetched upstream page whose
 * row count changed invalidates every mark after it. A last page that now
 * has a next cursor clears the recorded end, and the recorded end answers a
 * jump past it without a request only for a TTL after it was seen. Inserts
 * and deletes between calls shift rows across caller pages, the same as any
 * offset paging: a row can be served twice or missed, and a walk that starts
 * again sees the current state.
 *
 * A fetch that throws forgets its mark and every mark after it, so a retry
 * starts from the mark before it instead of reusing a cursor that may have
 * died. Where the platform names an expired chain (Salesforce's
 * INVALID_QUERY_LOCATOR), `restartOn` walks again from the first page in the
 * same call.
 *
 * ## Concurrent calls on one key
 *
 * Calls interleave at every await. A call whose mark was replaced or
 * truncated while it waited (another call saw the collection change) is
 * detached: it keeps walking on its own cursors and never reads or writes the
 * slot, the marks or the recorded end, whose history it no longer shares.
 * Identical calls in flight at once (the same key, page and limit, such as a
 * client retrying a slow page 1) share one walk instead of starting another.
 *
 * ## Time-to-live and memory
 *
 * The same sliding idle TTL as the cursor pager (`cursor-pager.ts`), counted
 * from the END of the last call, so one call slower than the TTL (a page of
 * Shopify transactions is one request per order) does not expire its own
 * walk. An entry with a call in progress is never pruned. Expired entries and
 * expired slots are pruned on every call, the least recently used entries
 * beyond {@link MAX_ENTRIES} are dropped, and a slot is dropped once the last
 * upstream page has been served. The reuse slot does NOT slide: rows fetched
 * more than a minute ago are fetched again.
 */
import type { QueryParams } from './base'
import type { CursorPage, PagedResult } from './cursor-pager'
import { reportUpstreamPage } from './page-meta'
import { DEFAULT_PAGE_LIMIT, pageOffset } from '../router/list-envelope'

export interface RowPagerOptions {
  /**
   * Upstream requests one call may make before it throws. It guards against
   * a chain that cycles, which would otherwise loop forever (a page that
   * names itself as the next is caught at once). Where rows are sparse (few
   * fulfillments across many pages of orders), filling one caller page
   * legitimately takes many upstream pages, so choose this per call site.
   * Default 1,000. A call that runs out while only peeking past a complete
   * page returns it with `hasMore: true` instead of throwing.
   */
  maxUpstreamPages?: number
  /**
   * Serve the upstream page the previous call ended in from memory when this
   * call continues forward from it. Default true.
   */
  reuseLastPage?: boolean
  /** The caller's page size when `params.limit` is absent. Default `DEFAULT_PAGE_LIMIT`. */
  defaultLimit?: number
  /**
   * Whether an error from fetching a remembered cursor means the whole chain
   * behind it expired (Salesforce's INVALID_QUERY_LOCATOR). When it returns
   * true, the call forgets every remembered position and walks again from the
   * first upstream page, once. Otherwise the error propagates.
   */
  restartOn?: (err: unknown) => boolean
}

const TTL_MS = 60_000
const DEFAULT_MAX_UPSTREAM_PAGES = 1_000
/** Walks remembered at once; the least recently used beyond this are dropped. */
export const MAX_ENTRIES = 1_000

/** Where upstream page `j` starts: its row offset, and the cursor that fetches it. */
interface Mark {
  offset: number
  cursor: unknown
}

/**
 * The rows of the last upstream page fetched for a key.
 *
 * Invariant: when `slot.index === j` and `marks[j]` exists, the slot holds the
 * page that `marks[j]` fetches. Only a call attached to the current history
 * writes the slot, for the mark it fetched. `marks[j]` is (re)created only by
 * `record(j - 1)`, right after a call fetched upstream page `j - 1` (moving
 * the slot there) or reused the slot there. So a reuse needs no offset check
 * of its own.
 */
interface Slot {
  index: number
  rows: unknown[]
  next: unknown
  /** Row offset up to which these rows have been served; a call starting at or past it continues forward. */
  servedTo: number
  fetchedAt: number
}

interface RowEntry {
  /** When the last call on this key ended (or started, while one is running). */
  at: number
  /** Calls on this key in progress. An entry in use is never pruned. */
  active: number
  marks: Mark[]
  /** Rows in the collection, once a walk reached the end of the chain. */
  total?: number
  /** Index of the upstream page that ended the chain. */
  lastIndex?: number
  /** When the end of the chain was seen. It answers a jump past it only while recent. */
  endAt?: number
  slot?: Slot
  /** When a page-1 call on this key last failed; a page-1 retry within the TTL resumes it. */
  firstPageFailedAt?: number
}

const cache = new Map<string, RowEntry>()
/** Calls in flight, by key, first row and limit: an identical call joins one instead of walking again. */
const inflight = new Map<string, Promise<PagedResult<unknown>>>()

/** Exported for tests — a module-level cache otherwise leaks across cases. */
export function _resetRowPager(): void {
  cache.clear()
  inflight.clear()
}

/** Exported for tests — how many walks are currently remembered. */
export function _rowPagerSize(): number {
  return cache.size
}

/** Exported for tests — how many rows the reuse slots hold, across every walk. */
export function _rowPagerRowsHeld(): number {
  let n = 0
  for (const e of cache.values()) n += e.slot?.rows.length ?? 0
  return n
}

function recent(t: number | undefined, now: number): boolean {
  return t !== undefined && now - t < TTL_MS
}

/** Drop expired walks and expired slots, then the least recently used walks past the cap. */
function prune(now: number): void {
  for (const [k, e] of cache) {
    if (e.active > 0) continue
    if (!recent(e.at, now)) cache.delete(k)
    else if (e.slot && !recent(e.slot.fetchedAt, now)) e.slot = undefined
  }
  // Map order is insertion order, and a key is re-inserted on every use.
  for (const [k, e] of cache) {
    if (cache.size <= MAX_ENTRIES) break
    if (e.active === 0) cache.delete(k)
  }
}

/** The entry for `key`, marked in use and moved to the most recently used end. */
function acquire(key: string): RowEntry {
  const now = Date.now()
  let e = cache.get(key)
  if (e && e.active === 0 && !recent(e.at, now)) e = undefined
  cache.delete(key)
  e ??= { at: now, active: 0, marks: [{ offset: 0, cursor: undefined }] }
  cache.set(key, e)
  e.at = now
  e.active++
  prune(now)
  return e
}

function release(e: RowEntry): void {
  e.active--
  e.at = Date.now()
}

/** Index of the last mark at or before row `lo`. Skips empty pages, which share an offset. */
function startIndex(marks: readonly Mark[], lo: number): number {
  let a = 0
  let b = marks.length - 1
  while (a < b) {
    const m = (a + b + 1) >> 1
    if (marks[m]!.offset <= lo) a = m
    else b = m - 1
  }
  return a
}

function clearEnd(e: RowEntry): void {
  e.total = undefined
  e.lastIndex = undefined
  e.endAt = undefined
}

/**
 * Forget mark `j` and everything after it, and the recorded end. A slot at or
 * past `j` needs no clearing: `marks[j]` comes back only when a call fetches
 * upstream page `j - 1`, which overwrites the slot first.
 */
function forgetFrom(e: RowEntry, j: number): void {
  if (e.marks.length > j) e.marks.length = j
  clearEnd(e)
}

/**
 * Record that upstream page `j`, fetched from `mark`, held `n` rows and
 * continues at `next`. Returns false without touching the entry when `mark`
 * is no longer page `j`'s mark: another call rewrote history while this one
 * waited for its fetch.
 */
function record(e: RowEntry, j: number, mark: Mark, n: number, next: unknown): boolean {
  if (e.marks[j] !== mark) return false
  const end = mark.offset + n
  if (next === undefined) {
    e.marks.length = j + 1
    e.total = end
    e.lastIndex = j
    e.endAt = Date.now()
    return true
  }
  const known = e.marks[j + 1]
  // This page changed size since the walk that recorded the marks after it.
  if (known && known.offset !== end) {
    e.marks.length = j + 1
    clearEnd(e)
  }
  // The collection grew past where a walk once ended.
  if (e.lastIndex !== undefined && e.lastIndex <= j) clearEnd(e)
  e.marks[j + 1] = { offset: end, cursor: next }
  return true
}

/**
 * The caller's page size: `params.limit`, else the default. A numeric string
 * is read as its number.
 *
 * Unlike `pageLocally`, which holds every row and so serves them all when no
 * limit is named, a walk has no rows in hand: "every row" would walk the whole
 * upstream chain in one call. So a missing limit is the default page, and an
 * unusable one is refused rather than guessed at.
 */
function pageSize(params: QueryParams, fallback: number | undefined): number {
  const raw: unknown = params.limit ?? fallback ?? DEFAULT_PAGE_LIMIT
  const asked = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  if (typeof asked !== 'number' || !Number.isFinite(asked) || asked < 1) {
    const got =
      typeof raw === 'string' ? `the string ${JSON.stringify(raw)}` : `${typeof raw} ${String(raw)}`
    throw new RangeError(`pageByRows: limit must be a number >= 1 (got ${got})`)
  }
  return Math.floor(asked)
}

/** Rows [lo, lo + limit) of the stream behind `key`, on entry `e`. */
async function walk<R, C>(
  e: RowEntry,
  key: string,
  lo: number,
  limit: number,
  fetch: (cursor: C | undefined) => Promise<CursorPage<R, C>>,
  options: RowPagerOptions,
): Promise<PagedResult<R>> {
  const hi = lo + limit
  const firstPage = lo === 0
  const started = Date.now()
  if (!firstPage && e.total !== undefined && lo >= e.total && recent(e.endAt, started))
    return { items: [], hasMore: false }
  const budget = options.maxUpstreamPages ?? DEFAULT_MAX_UPSTREAM_PAGES
  const reuse = options.reuseLastPage ?? true
  const resume = firstPage && recent(e.firstPageFailedAt, started)
  let out: R[] = []
  let restarted = false
  let fetched = 0
  let j = firstPage && !resume ? 0 : startIndex(e.marks, lo)
  let mark = e.marks[j]!
  for (;;) {
    // Attached: still walking the history the memo records.
    const attachedHere = e.marks[j] === mark
    let rows: R[]
    let next: C | undefined
    const s = e.slot
    if (
      reuse &&
      !firstPage &&
      !restarted &&
      attachedHere &&
      s &&
      s.index === j &&
      lo >= s.servedTo &&
      recent(s.fetchedAt, Date.now())
    ) {
      rows = s.rows as R[]
      next = s.next as C | undefined
    } else {
      if (fetched >= budget) {
        // Every row of the page is in hand; only the peek ran out.
        if (out.length === limit) return { items: out, hasMore: true }
        throw new Error(`pageByRows: more than ${budget} upstream pages for one page of ${key}`)
      }
      fetched++
      let res: CursorPage<R, C>
      try {
        res = await fetch(mark.cursor as C | undefined)
      } catch (err) {
        if (j === 0) throw err
        const attached = e.marks[j] === mark
        if (!restarted && options.restartOn?.(err) === true) {
          // The slot may hold a page of the expired chain, and its cursor; the
          // restarted walk fetches every page again.
          restarted = true
          if (attached) forgetFrom(e, 1)
          out = []
          j = 0
          mark = e.marks[0]!
          continue
        }
        if (attached) forgetFrom(e, j)
        throw err
      }
      rows = res.items
      next = res.next ?? undefined
      if (next !== undefined && next === mark.cursor)
        throw new Error(
          `pageByRows: upstream page ${j} of ${key} names itself as the next page; following it would loop`,
        )
      if (e.marks[j] === mark)
        e.slot = { index: j, rows, next, servedTo: -1, fetchedAt: Date.now() }
    }
    const attached = record(e, j, mark, rows.length, next)
    const start = mark.offset
    const end = start + rows.length
    if (end > lo && start < hi)
      out.push(...rows.slice(Math.max(lo - start, 0), Math.min(hi - start, rows.length)))
    if (attached && e.slot && e.slot.index === j) {
      e.slot.servedTo = Math.max(e.slot.servedTo, Math.min(end, hi))
      // The last upstream page, served to its end: nothing left to continue from.
      if (next === undefined && e.slot.servedTo >= end) e.slot = undefined
    }
    // A row past `hi` exists.
    if (end > hi) return { items: out, hasMore: true }
    if (next === undefined) return { items: out, hasMore: false }
    // Continue, or peek when this page ended exactly at `hi`: the next page
    // (or the first non-empty one after it) decides `hasMore`, and stays in
    // the slot for the caller's next page.
    j++
    mark = attached ? e.marks[j]! : { offset: end, cursor: next }
  }
}

async function cutRows<R, C>(
  key: string,
  lo: number,
  limit: number,
  fetch: (cursor: C | undefined) => Promise<CursorPage<R, C>>,
  options: RowPagerOptions,
): Promise<PagedResult<R>> {
  const e = acquire(key)
  try {
    const result = await walk(e, key, lo, limit, fetch, options)
    if (lo === 0) e.firstPageFailedAt = undefined
    return result
  } catch (err) {
    if (lo === 0) e.firstPageFailedAt = Date.now()
    throw err
  } finally {
    release(e)
  }
}

/**
 * The caller's page of a stream of rows that arrives in upstream pages of any
 * size, with `hasMore` exact. Reports `hasMore` and `pagedLocally` to the
 * page sink itself.
 *
 * `fetch(undefined)` returns the first upstream page. Each page's `next`
 * starts the following one; absent or null ends the stream. A cursor must be
 * a replayable position: fetching it again returns that page again. Rows come
 * back already flattened, merged or transformed, in stream order, and
 * `rows.length` is what counts.
 *
 * `key` must identify everything a cursor or a row depends on: the connection
 * (not only the account: see `connectionScope`), the collection, every
 * filter, and the UPSTREAM page size (see `cursorPagerKey`). Leave the
 * caller's `limit` out unless it sizes the upstream page. Row positions do
 * not depend on it, so a sync and an API walk at different page sizes then
 * share one walk.
 *
 * A caller holding an explicit upstream cursor (`page_info`, `cursor`) is at
 * a position, not a row offset, and should not come through here.
 *
 * Params with no `limit` get a page of `options.defaultLimit` rows, and a
 * limit that is not a number ≥ 1 throws a RangeError. `pageLocally` differs
 * here on purpose: it already holds every row, so it serves them all.
 */
export async function pageByRows<R, C = string>(
  key: string,
  params: QueryParams,
  fetch: (cursor: C | undefined) => Promise<CursorPage<R, C>>,
  options: RowPagerOptions = {},
): Promise<PagedResult<R>> {
  const limit = pageSize(params, options.defaultLimit)
  const lo = pageOffset(params, limit)
  const flight = `${key}\u0000${lo}\u0000${limit}`
  let pending = inflight.get(flight) as Promise<PagedResult<R>> | undefined
  if (!pending) {
    const started = cutRows(key, lo, limit, fetch, options)
    pending = started
    inflight.set(flight, started)
    const settle = (): void => {
      if (inflight.get(flight) === started) inflight.delete(flight)
    }
    started.then(settle, settle)
  }
  const result = await pending
  reportUpstreamPage(params, { hasMore: result.hasMore, pagedLocally: true })
  return { items: [...result.items], hasMore: result.hasMore }
}
