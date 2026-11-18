/**
 * How an adapter reports what the upstream platform said about paging.
 *
 * `listResponse()` has always been able to publish `totalCount`, `page`,
 * `limit` and a derived `hasMore` — the envelope type declares all four and the
 * helper computes `hasMore` when given them. Every router just called it with
 * two arguments, so the fields were `undefined` and dropped from the JSON, and
 * clients were left inferring "there may be more" from `len(data) === limit`.
 * That guess fires a spurious request when the total is an exact multiple of
 * the page size, and breaks entirely if the server clamps `limit`.
 *
 * The missing half was a channel. List methods return a bare `T[]`, and the
 * array the router ends up with is not always the one the adapter returned —
 * `stripRawPayloads` and the cache path both produce new arrays — so pagination
 * cannot ride on the result. `QueryParams` is the object that survives: created
 * once per request and handed straight to the adapter.
 *
 * The sink is defined non-enumerably on purpose. Adapters routinely spread
 * `params` into an HTTP client's query string, and an enumerable `__pageSink`
 * would be serialised into the upstream URL.
 *
 * Reporting is optional and always honest. An adapter whose platform sends no
 * count reports nothing, `totalCount` stays absent, and `hasMore` stays
 * undefined rather than being guessed — an unknown total is a fact worth
 * publishing as unknown, in the same spirit as the null-vs-empty rule for
 * collections.
 */
import type { QueryParams } from './base'

/** What a platform can tell us about the page it just returned. */
export interface UpstreamPageMeta {
  /** Total rows matching the query across all pages, when reported. */
  totalCount?: number
  /** Total number of pages, when the platform counts pages rather than rows. */
  totalPages?: number
  /** The page the platform believes it served, when it echoes one back. */
  currentPage?: number
  /**
   * Whether the platform has rows beyond this page, when the adapter knows —
   * typically because a cursor platform returned a next cursor.
   *
   * The sync worker ends a collection on this when it is present, instead of
   * inferring the end from a short page. That inference is wrong for any list
   * that is not one upstream page of its own rows: rows flattened from pages of
   * a parent (Shopify fulfillments from pages of orders), merged from several
   * endpoints, or split across filter batches. A page of 250 orders holding 40
   * fulfillments is "short", and the worker used to mark a truncated
   * collection complete on it. Report only what the platform actually said.
   */
  hasMore?: boolean
  /**
   * The page size the method actually asked the platform for, when that is
   * smaller than `params.limit`: an endpoint whose ceiling is below the
   * adapter's declared `maxPageSize` (JD.com promotions take 10 where its
   * refunds take 50), or an adapter whose endpoints disagree too much for one
   * declaration (otto-market: shipments 25, orders 128).
   *
   * Every short-page judgement then uses this size instead of the limit: the
   * router's `meta.limit` and `meta.hasMore`, the cache's
   * `collectionIsComplete`, and the sync worker's last-page test. Without it,
   * a full page of 10 against a limit of 50 reads as the last page. A method
   * whose endpoints share one ceiling should declare `maxPageSize` instead, so
   * the router asks for the right size in the first place.
   */
  pageSize?: number
  /**
   * This page was cut from rows the adapter had already fetched, so the
   * requests behind two caller pages need not differ: `pageLocally` slicing
   * a whole-collection fetch, `pageByRows` re-cutting upstream pages that are
   * not the caller's size, or a hand-rolled window over a fixed-size upstream
   * page (Epos Now's 200-row V4 pages, Lumin Sign's 10/25/50).
   *
   * Read by `check:paging-contract`, which otherwise judges a method by
   * whether its requests move with `page` and follow `limit`: a local window
   * and a method that ignores `page` send identical requests, and only this
   * says which one served each row once. Reporting it claims that every row
   * is served once at the caller's page size, and the gate takes that claim
   * on trust. A window that clamps to a smaller size than `params.limit`
   * (a direct call past its maximum) pages at that size instead, and must
   * report it as `pageSize` too, or the claim is false. Report it only from
   * code whose slicing is under test, never to silence a verdict. The two
   * shared helpers set it themselves; a hand-rolled window is listed in the
   * gate's `LOCAL_PAGE_REPORTERS` with that test.
   *
   * An ordinary field of the report, like the others: nothing reads the
   * report by enumerating it, and the sink itself is non-enumerable on
   * `params`, so the flag never reaches a query string built from them.
   */
  pagedLocally?: boolean
}

const SINK = '__pageSink'

/** Attach a sink to the params a router is about to hand an adapter. */
export function withPageSink(params: QueryParams): QueryParams {
  Object.defineProperty(params, SINK, {
    value: {} as UpstreamPageMeta,
    enumerable: false,
    writable: true,
    configurable: true,
  })
  return params
}

/**
 * Record what the platform reported. Safe to call with params that carry no
 * sink — an adapter should not have to know whether its caller wanted one.
 */
export function reportUpstreamPage(params: QueryParams, meta: UpstreamPageMeta): void {
  const sink = (params as Record<string, unknown>)[SINK] as UpstreamPageMeta | undefined
  if (!sink) return
  Object.assign(sink, meta)
}

/**
 * The page size a request was really judged at: `limit`, or the smaller
 * `pageSize` the adapter reported asking the platform for. A reported size
 * that is not a whole number ≥ 1, or not below `limit`, is ignored.
 */
export function effectivePageSize(params: QueryParams, limit: number): number {
  const size = readUpstreamPage(params)?.pageSize
  return typeof size === 'number' && Number.isInteger(size) && size >= 1 && size < limit
    ? size
    : limit
}

/** Read back what the adapter reported, or `undefined` if it reported nothing. */
export function readUpstreamPage(params: QueryParams): UpstreamPageMeta | undefined {
  const sink = (params as Record<string, unknown>)[SINK] as UpstreamPageMeta | undefined
  if (!sink || Object.keys(sink).length === 0) return undefined
  return sink
}

/** The one thing {@link declaredPageMax} reads from an adapter. */
export interface PageMaxBearing {
  readonly capabilities?: { readonly maxPageSize?: number }
}

/**
 * The adapter's declared page maximum (`capabilities.maxPageSize`), or
 * `undefined` when it declares none usable.
 *
 * Only a finite integer ≥ 1 counts: 0, a negative, NaN, a fraction or
 * Infinity is a declaration bug, and clamping to it would send a nonsense page
 * size. Both readers — the router's `parseListQuery` and the sync worker — go
 * through this one function, because the capability's whole point is that the
 * size a page is asked for and the size its shortness is judged against are
 * the same number on every path. Two readers that disagreed about which
 * declarations count would break exactly that.
 */
export function declaredPageMax(adapter: PageMaxBearing | undefined): number | undefined {
  const max = adapter?.capabilities?.maxPageSize
  return typeof max === 'number' && Number.isInteger(max) && max >= 1 ? max : undefined
}
