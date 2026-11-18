/**
 * The list-response envelope, shared by every vertical.
 *
 * This lived in `accounting/router/helpers.ts` and nowhere else, which is why
 * `accounting` was the only vertical that parsed a query parameter, honoured
 * `limit`, or returned a `meta` block — while all nine verticals' OpenAPI
 * documents described `ListMeta` as "returned alongside every `/v1/*` list
 * response". Fifty-nine list routes in the other eight verticals answered with
 * a bare `{ data }`, so the published contract was simply untrue for them.
 *
 * Two consequences beyond the missing metadata:
 *
 *   - Routes passed `request.query` straight to the adapter, so `limit` and
 *     `page` arrived as STRINGS and `updated_after` never arrived at all —
 *     adapters read `params.updatedAfter`, the raw query carries
 *     `updated_after`. 170 adapters across seven verticals contain
 *     incremental-sync code that has never once received a value.
 *   - Nothing enforced `limit`, so an adapter that ignored it produced an
 *     unbounded response with no signal.
 *
 * One implementation, used everywhere, is the point: the previous arrangement
 * is what let the two halves of the surface drift apart without anyone
 * noticing.
 */
import {
  withPageSink,
  readUpstreamPage,
  reportUpstreamPage,
  declaredPageMax,
  effectivePageSize,
  type PageMaxBearing,
} from '../adapter/page-meta'
import type { QueryParams } from '../adapter/base'

/** Page size assumed when the caller names no limit, mirroring the adapters. */
export const DEFAULT_PAGE_LIMIT = 100

/** Largest page a caller may ask for, mirroring every vertical's OpenAPI. */
export const MAX_PAGE_LIMIT = 500

export interface ListMeta {
  platform: string
  /** Total upstream reports for this collection, or `null` when it reports
   *  none. Never omitted — absence is indistinguishable from a field nobody
   *  implemented, which is exactly how this surface drifted. */
  totalCount: number | null
  /** 1-based. A missing `?page`, or one that is not a decimal number ≥ 1, is
   *  1, and a fraction is floored. See {@link parseListQuery}. */
  page: number
  /** The page size served: the caller's limit, clamped to [1, 500] and to
   *  the adapter's declared `maxPageSize` (see {@link parseListQuery}), or the
   *  smaller size the adapter reported asking its platform for. */
  limit: number
  /** `null` when a full page makes it genuinely undecidable — see
   *  {@link deriveHasMore}. */
  hasMore: boolean | null
  fetchedAt: string
}

export interface ListEnvelope<T> {
  data: T[]
  meta: ListMeta
}

/** Minimal logger surface — Fastify's `request.log` satisfies it. */
export interface ListPageLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void
}

/**
 * Parse the request's paging/filter query into typed adapter params.
 *
 * `limit` is defaulted rather than left undefined so the router knows the page
 * size it actually asked for: `meta.limit` would otherwise report 100 while
 * the adapter quietly used its own default (which ranges from 20 to 100 across
 * the catalogue), and {@link collectionIsComplete} could not tell a last page
 * from a full one.
 *
 * Pass the adapter. Its `capabilities.maxPageSize` caps `limit`, for the same
 * reason: an adapter that clamps to its platform's maximum returns fewer rows
 * than it was asked for, and against the caller's larger limit that full page
 * reads as the last one. Paysafe (maximum 50) answered the default limit of
 * 100 with 50 rows, `meta.hasMore: false`, and a cache that stored those 50
 * as the whole collection. The sync worker already caps its page size this
 * way; this is the API path catching up.
 *
 * `page` is normalised by {@link parsePage}: anything but a decimal number ≥ 1
 * is the first page (`undefined`, which every adapter reads as
 * `params.page ?? 1`), and a fraction is floored. `meta.page` echoed 0 or -3
 * back otherwise, and with a reported total `page × limit < total` claimed
 * another page after the adapter had served the whole collection as page 1.
 *
 * A malformed `updated_after` is refused here rather than becoming an Invalid
 * Date that throws `RangeError` deep inside an adapter's `.toISOString()` —
 * that surfaced to callers as `500 INTERNAL`, blaming the server for the
 * caller's input.
 */
export function parseListQuery(query: unknown, adapter?: PageMaxBearing): QueryParams {
  const q = (query ?? {}) as Record<string, string>
  const asked = q['limit'] ? parseInt(q['limit'], 10) : DEFAULT_PAGE_LIMIT
  // Exactly the caller's page size. The router once asked for limit + 1 and
  // dropped the extra row to decide `hasMore`; every upstream that positions
  // the next page from what it was sent — a cursor minted after the extra
  // row, an offset computed from the inflated limit — then lost that row at
  // every page boundary on the API path (measured on ≥580 adapters).
  // `hasMore` now comes from a count, the adapter's own report, or a short
  // page; a full page with none of those is honestly `null`.
  const limit = Number.isFinite(asked)
    ? Math.min(Math.max(asked, 1), MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT
  const max = declaredPageMax(adapter)
  return withPageSink({
    page: parsePage(q['page']),
    limit: max === undefined ? limit : Math.min(limit, max),
    updatedAfter: parseUpdatedAfter(q['updated_after']),
    search: q['search'],
  })
}

/**
 * `?page` as a page number ≥ 1, or `undefined` for the first page.
 *
 * Decimal digits only, with an optional fraction that is floored (`2.7` is
 * page 2). `parseInt` read the leading digits of anything — `2abc` was page
 * 2 and `1e3` page 1 — and `Number` would read `0x10` as 16. A page too
 * large to be an exact integer is refused too: an offset adapter would
 * otherwise send `(page − 1) × limit` upstream in exponent notation.
 */
function parsePage(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined
  const text = raw.trim()
  if (!/^\d+(?:\.\d+)?$/.test(text)) return undefined
  const page = Math.floor(Number(text))
  return page >= 1 && Number.isSafeInteger(page) ? page : undefined
}

/**
 * The 1-based page a params object asks for: a missing, 0, negative or
 * non-finite page is page 1, and a fractional one is floored. Params do not
 * always come from {@link parseListQuery}: the sync worker and tests build
 * their own.
 */
function pageNumber(params: QueryParams): number {
  const page = params.page
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

/**
 * @deprecated The router no longer inflates `limit`; this is `params.limit`.
 * Kept so code written against the probe keeps compiling — `listPage` and
 * `collectionIsComplete` below still read it, and an in-flight shipbob-inventory
 * branch imports it.
 */
export function callerLimit(params: QueryParams): number {
  return params.limit ?? DEFAULT_PAGE_LIMIT
}

/**
 * 0-based row offset of a 1-based `page`, for platforms that page by offset.
 *
 * `page × limit` starts page 1 one page in, so the first `limit` rows are never
 * served. A missing, 0, negative or non-finite page is page 1.
 *
 * `pageSize` is the size this request actually asks the platform for — after
 * any clamp to its maximum. Striding by the caller's larger limit skips the
 * rows in between on every page.
 */
export function pageOffset(params: QueryParams, pageSize: number): number {
  return (pageNumber(params) - 1) * pageSize
}

/**
 * One caller page of a list the platform returns whole.
 *
 * An upstream with no paging answers every request with every row. Returned
 * as is, the router truncated it to `limit` and page 2 repeated page 1 (or
 * came back empty), so rows past the first page were unreachable — at any
 * limit, once the adapter declares a page maximum smaller than the
 * collection. Sliced here by the same arithmetic an offset upstream uses,
 * each row is served once, and the reported total makes `hasMore` exact for
 * the router and the sync worker alike.
 *
 * `rows` must be every row matching the query, never one sized page of a
 * paginated endpoint: the total is reported as fact, a cache marks the
 * collection complete on it, and the paging-contract gate passes the method
 * on the `pagedLocally` this reports, which it takes on trust.
 *
 * A caller that names no usable limit (absent, or not a finite number ≥ 1;
 * the router always sends one) asked for everything, and gets it: every row
 * is already in hand. `pageByRows`, whose rows are not, reads the same params
 * differently: a missing limit is its `defaultLimit`, and an unusable one
 * throws.
 */
export function pageLocally<T>(rows: readonly T[], params: QueryParams): T[] {
  const limit = params.limit
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    reportUpstreamPage(params, { totalCount: rows.length, hasMore: false, pagedLocally: true })
    return [...rows]
  }
  const size = Math.floor(limit)
  const start = pageOffset(params, size)
  reportUpstreamPage(params, {
    totalCount: rows.length,
    hasMore: start + size < rows.length,
    pagedLocally: true,
  })
  return rows.slice(start, start + size)
}

export function parseUpdatedAfter(raw: string | undefined): Date | undefined {
  if (raw === undefined) return undefined
  const trimmed = String(raw).trim()
  // A client that always appends `&updated_after=` is not making an error.
  if (!trimmed) return undefined
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) {
    throw Object.assign(
      new Error(
        `\`updated_after\` must be an ISO-8601 date or date-time (got "${trimmed}"). ` +
          'Example: 2026-01-01T00:00:00Z',
      ),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }
  return d
}

/**
 * Is there another page, and do we actually know?
 *
 * Almost no adapter reports a total, so a count-based answer is unavailable
 * nearly everywhere. It is still derivable from what the adapter returned
 * against the page it was asked for — the same last-page signal `SyncWorker`
 * stops on — provided the answer distinguishes "no" from "cannot tell":
 *
 *   count known        -> arithmetic, exact
 *   returned > limit   -> TRUE. The adapter over-returned and the router
 *                         truncated, so more provably exists. This is why the
 *                         PRE-truncation length is the input. The router asks
 *                         for exactly the caller's limit, so this now happens
 *                         only for an adapter that ignores or flattens `limit`
 *                         (rows expanded from pages of a parent, several
 *                         endpoints merged) — never as a probe it requested.
 *   adapter said so    -> its answer. A cursor platform states this outright
 *                         (Salesforce's SOQL `done`, HubSpot's `paging.next`)
 *                         and the adapter forwards it via
 *                         `reportUpstreamPage`. It is only consulted below the
 *                         over-return check, because over-returning is proof
 *                         of more rows regardless of what was claimed.
 *   returned < limit   -> FALSE. A short page ends the collection.
 *   returned == limit  -> NULL. Indistinguishable from a collection that is an
 *                         exact multiple of the page size. `true` would cost a
 *                         wasted request every time; `false` would silently
 *                         truncate. `null` says which case this is.
 *
 * Precedence note: `totalCount` stays ahead of the reported flag. Both are
 * exact, and the adapters that report a total already depend on that path.
 */
export function deriveHasMore(
  returned: number,
  page: number,
  limit: number,
  totalCount?: number,
  reported?: boolean,
): boolean | null {
  if (typeof totalCount === 'number') return page * limit < totalCount
  if (returned > limit) return true
  if (typeof reported === 'boolean') return reported
  if (returned < limit) return false
  return null
}

/**
 * Build a list response whose `meta` describes the payload it ships with.
 *
 * The truncation is a backstop, not a fix: an adapter that ignores `limit`
 * almost certainly ignores `page` too, and this cannot detect that. So it also
 * warns, naming the platform — the payload stays honest and the adapter bug
 * stays visible somewhere a maintainer will see it.
 *
 * Applied AFTER any cache read, so the store keeps every row actually fetched;
 * trimming a response must not shrink the cache.
 */
export function listPage<T>(
  items: T[],
  params: QueryParams,
  platform: string,
  log?: ListPageLogger,
): ListEnvelope<T> {
  const upstream = readUpstreamPage(params)
  // The size the adapter asked its platform for: the limit, or the smaller
  // page size it reported (see UpstreamPageMeta.pageSize).
  const limit = effectivePageSize(params, callerLimit(params))
  // Normalised here too, not only in parseListQuery: this is exported, and
  // hand-built params with page 0 would echo `meta.page: 0` and, with a
  // reported total, `0 × limit < total` would claim a page that does not exist.
  const page = pageNumber(params)
  let data = items
  if (items.length > limit) {
    log?.warn(
      { platform, requested_limit: limit, returned: items.length },
      'adapter ignored the requested limit; response truncated to keep meta.limit honest',
    )
    data = items.slice(0, limit)
  }
  return {
    data,
    meta: {
      platform,
      totalCount: upstream?.totalCount ?? null,
      page,
      limit,
      hasMore: deriveHasMore(items.length, page, limit, upstream?.totalCount, upstream?.hasMore),
      fetchedAt: new Date().toISOString(),
    },
  }
}

/**
 * May these rows be stored as the collection's cached contents?
 *
 * The store records rows without recording the query that produced them, and
 * the read side treats "some rows exist" as "all rows exist" — so a page
 * written there later answers an unfiltered read as though it were the whole
 * collection.
 */
export function collectionIsComplete(params: QueryParams, rows: unknown[]): boolean {
  const upstream = readUpstreamPage(params)
  const total = upstream?.totalCount
  if (typeof total === 'number') return rows.length >= total
  // The adapter's own word that more rows exist, in the same precedence
  // `deriveHasMore` gives it (after a total). A page can be shorter than
  // `limit` and still not be the last: otto-market serves at most 25
  // shipments and reports `hasMore` from the upstream's rel:next. Judged by
  // length alone, the response said `hasMore: true` while the cache stored
  // those 25 rows as the whole collection.
  if (upstream?.hasMore === true) return false
  // A page of exactly `limit` rows is full, not short; calling it complete
  // would cache a partial collection. Judged at the size actually asked for.
  return rows.length < effectivePageSize(params, callerLimit(params))
}

export interface SingleMeta {
  platform: string
  fetchedAt: string
}

export interface SingleEnvelope<T> {
  data: T
  meta: SingleMeta
}

/**
 * The single-record counterpart. Every vertical's OpenAPI declares
 * `SingleMeta` on its `get` responses, and eight of them answered with a bare
 * `{ data }` — the same published-contract violation as the list case, and
 * fixed here for the same reason: a client cannot tell a field that is absent
 * from a field that was never implemented.
 */
export function singleResponse<T>(data: T, platform: string): SingleEnvelope<T> {
  return { data, meta: { platform, fetchedAt: new Date().toISOString() } }
}

interface CapabilityBearing {
  platform: string
  capabilities?: { search?: boolean }
}

/** Has this adapter declared that it honours `params.search`? */
export function adapterSupportsSearch(adapter: CapabilityBearing): boolean {
  return adapter.capabilities?.search === true
}

/**
 * Refuse `search` on an adapter that has not declared support for it.
 *
 * The alternative — accepting and dropping the term — returns a plausible
 * unfiltered page that a caller cannot distinguish from a filter that matched
 * everything. `list_accounts(search: "Inventory")` answered with the first
 * three accounts in the chart and an unchanged `totalCount`, and nothing in
 * the response said the term had been discarded.
 *
 * An empty or absent term is not a request to filter, so it passes.
 */
export function assertSearchSupported(
  adapter: CapabilityBearing,
  params: { search?: unknown },
): void {
  const term = params.search
  if (typeof term !== 'string' || term.trim() === '') return
  if (adapterSupportsSearch(adapter)) return
  throw Object.assign(
    new Error(
      `The '${adapter.platform}' adapter does not support the \`search\` parameter. ` +
        'Omit it and filter client-side, or use a platform that declares search support. ' +
        'It is refused rather than ignored so an unfiltered page is never mistaken for a filtered one.',
    ),
    { statusCode: 400, code: 'SEARCH_UNSUPPORTED' },
  )
}
