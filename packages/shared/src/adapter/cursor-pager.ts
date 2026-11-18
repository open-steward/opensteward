/**
 * Translate the sync worker's 1-based `page` into a platform's cursor chain.
 *
 * Many platforms have no offset. The only way to reach page N is to walk pages
 * 1..N-1 and carry each response's cursor forward (HubSpot `paging.next.after`,
 * Shopify `page_info` in the Link header). The sync worker asks for
 * `{ page, limit }` and adapters return a bare array, so an adapter that simply
 * drops `page` answers every page with page 1. Against the worker that is one
 * of two silent wrongs: a truncated collection marked complete, or the same
 * page re-fetched until `maxPagesPerResource` — 10,000 requests by default.
 *
 * Started life as `crm/hubspot/cursor-pager.ts`; moved here when Shopify, a
 * second vertical, hit the same wall.
 *
 * ## Why memoise rather than re-walk
 *
 * Re-walking from page 1 on every call is correct but quadratic: a 10,000-row
 * collection at 100 a page costs 5,050 requests instead of 100. The worker's
 * access is strictly sequential, so remembering the cursor that STARTS each
 * page makes the common path one request per page. A non-sequential request (a
 * client jumping to page 7) falls back to the walk, so correctness never
 * depends on the cache being warm.
 *
 * ## Time-to-live
 *
 * Cursors are positions in a live collection and go stale as rows are added,
 * so an abandoned walk must be forgotten. The time-to-live SLIDES with use: the
 * HubSpot original stamped an entry once at creation, so any sync longer than
 * a minute fell back to re-walking from page 1 on every page — exactly the
 * quadratic cost the cache exists to avoid, on exactly the large collections
 * where it matters. Expired entries are pruned when a new walk starts, so a
 * long-running process does not accumulate one entry per connection per
 * collection per filter forever.
 */
import { createHash } from 'node:crypto'
import type { Credentials } from '../auth/store'
import { _resetRowPager } from './row-pager'

/** One upstream page, as an adapter's fetch function reports it. */
export interface CursorPage<T, C> {
  items: T[]
  /** The cursor that STARTS the next page; absent or null when this page is the last. */
  next?: C | null
}

/** One page for the caller, with whether the platform has more after it. */
export interface PagedResult<T> {
  items: T[]
  hasMore: boolean
}

/** Idle time after which a walk's cursors are forgotten. */
const TTL_MS = 60_000

interface Entry {
  at: number
  /** page number → the cursor that STARTS that page. Page 1 has none. */
  cursors: Map<number, unknown>
  /**
   * The collection's last page, once a walk has reached it. A page past it is
   * empty without a request — which matters where a list merges endpoints page
   * by page (Shopify collections): the short endpoint would otherwise re-fetch
   * its only page on every page of the long one.
   */
  last?: number
}

const cache = new Map<string, Entry>()

/**
 * Exported for tests — a module-level cache otherwise leaks across cases.
 *
 * Also resets the row pager (`row-pager.ts`). Adapter tests, and the
 * paging-contract gate between probes, reset only this one, and an adapter
 * that moves from `pageByCursor` to `pageByRows` must not start leaking row
 * memos from one case into the next.
 */
export function _resetCursorPager(): void {
  cache.clear()
  _resetRowPager()
}

/** Exported for tests — how many walks are currently remembered. */
export function _cursorPagerSize(): number {
  return cache.size
}

function entryFor(key: string): Entry {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < TTL_MS) {
    hit.at = now
    return hit
  }
  for (const [k, e] of cache) if (now - e.at >= TTL_MS) cache.delete(k)
  const fresh: Entry = { at: now, cursors: new Map() }
  cache.set(key, fresh)
  return fresh
}

/**
 * Fetch page `page`, walking the cursor chain only as far as needed.
 *
 * `key` must identify everything a cursor depends on — the connection, the
 * collection, and every filter and the page size (see {@link cursorPagerKey}).
 * Two queries sharing a key would hand one of them the other's position.
 *
 * `fetch(undefined)` must return page 1. A page past the end of the collection
 * is empty with `hasMore: false` — which the worker reads as the end — rather
 * than a loop.
 */
export async function pageByCursor<T, C = string>(
  key: string,
  page: number | undefined,
  fetch: (cursor: C | undefined) => Promise<CursorPage<T, C>>,
): Promise<PagedResult<T>> {
  const target =
    typeof page === 'number' && Number.isFinite(page) && page > 1 ? Math.floor(page) : 1
  const entry = entryFor(key)
  if (entry.last != null && target > entry.last) return { items: [], hasMore: false }

  // Page 1 needs no cursor. For any other page start from the nearest page at
  // or below it whose starting cursor is remembered.
  let current = 1
  let cursor: C | undefined
  for (let p = target; p > 1; p--) {
    if (entry.cursors.has(p)) {
      cursor = entry.cursors.get(p) as C
      current = p
      break
    }
  }

  for (;;) {
    const res = await fetch(cursor)
    const next = res.next ?? undefined
    if (next !== undefined) {
      entry.cursors.set(current + 1, next)
      // The collection grew past where a walk once ended.
      if (entry.last != null && entry.last <= current) entry.last = undefined
    } else {
      entry.last = current
    }

    if (current === target) return { items: res.items, hasMore: next !== undefined }
    if (next === undefined) return { items: [], hasMore: false }

    cursor = next
    current++
  }
}

/** Params that say WHERE in a collection, not WHICH collection. */
const POSITION_KEYS = new Set(['page', 'cursor', 'page_info', 'after'])

/**
 * A pager key for `collection` under `scope`, covering every param that shapes
 * the result set.
 *
 * `scope` must be stable across token refresh and unique per connection — a
 * HubSpot portal id, a Shopify shop — never the access token, which changes
 * hourly and would miss the cache. For the row pager (`row-pager.ts`), which
 * keeps rows and not only positions, an account is not enough: build the
 * scope with {@link connectionScope}. Position params are excluded because
 * they are what the pager resolves; everything else (filters, page size) is
 * included, because a cursor minted under one filter or size is a different
 * position under another.
 */
export function cursorPagerKey(
  scope: string,
  collection: string,
  params: Record<string, unknown>,
): string {
  const parts = Object.keys(params)
    .filter((k) => !POSITION_KEYS.has(k) && params[k] !== undefined)
    .sort()
    .map((k) => {
      const v = params[k]
      const text =
        v instanceof Date
          ? v.toISOString()
          : typeof v === 'object' && v !== null
            ? JSON.stringify(v)
            : String(v)
      return `${k}=${text}`
    })
  return `${scope}::${collection}::${parts.join('&')}`
}

/**
 * A pager scope for ONE connection: `account` (a Salesforce org URL, a
 * Shopify shop) plus a fingerprint of the connection's refresh token, or of
 * its access token when it has none.
 *
 * An account is shared by every connection to it, and those connections need
 * not see the same rows: Salesforce applies sharing rules and field-level
 * security per user, and two installs on one Shopify shop can hold different
 * scopes (`read_all_orders`). The cursor pager keeps only positions, and each
 * caller still fetches its page with its own token. The row pager keeps ROWS
 * and a collection's end, so a key shared across connections would hand one
 * connection's rows to another without a request under the second's token.
 *
 * The refresh token is preferred because it outlives an access-token refresh.
 * Where it rotates, or where there is none and the access token does, a
 * refresh starts a new walk: one re-walk, nothing worse. The fingerprint is
 * 16 hex digits of a SHA-256, so neither token ends up in a key, a log or an
 * error message.
 */
export function connectionScope(
  account: string,
  credentials: Pick<Credentials, 'accessToken' | 'refreshToken'>,
): string {
  const secret = credentials.refreshToken || credentials.accessToken || ''
  const fingerprint = createHash('sha256').update(secret).digest('hex').slice(0, 16)
  return `${account}#${fingerprint}`
}
