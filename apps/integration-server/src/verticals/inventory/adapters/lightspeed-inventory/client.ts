/**
 * Lightspeed Retail (X-Series) HTTP client.
 *
 * Base URL: https://{domain_prefix}.retail.lightspeed.app/api/2.0
 *
 * Pagination (v2.0 version keyset), from
 * https://x-series-api.lightspeedhq.com/v1.0/docs/pagination.md:
 *
 *   "The highest `version` number `x` from this collection (the `max`
 *    attribute above) should be used to request the next page like:
 *    /api/2.0/products?after=x
 *    This should be repeated until an empty collection is returned. This will
 *    mean that all items of the collection have been returned."
 *   "The `version` attribute is simply a monotonically increasing integer."
 *
 * and `after` is exclusive: "if you select all entries with version greater
 * than 158306 in this case, you are guaranteed to get all the entries"
 * (https://x-series-api.lightspeedhq.com/v1.0/docs/sync_entity_to_external_system.md).
 *
 * Rate limiting: Lightspeed uses 429 for throttling — handled with exponential
 * back-off up to 4 retries.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

function buildBaseUrl(domainPrefix: string): string {
  return `https://${domainPrefix}.retail.lightspeed.app/api/${API_VERSION}`
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * The page size to send: the caller's limit up to {@link MAX_PAGE_SIZE}, or
 * the documented default for a direct call without a usable limit.
 */
function pageSizeOf(params: QueryParams): number {
  const n = Math.floor(Number(params.limit))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
}

/** A version number as Lightspeed sends it (an integer, possibly as a string). */
function toVersion(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v)
  return undefined
}

/**
 * The rows of a list response. The current reference answers `{ data, version }`;
 * the legacy 2.0 reference types GET /consignments as a bare array.
 */
function collectionOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const data = (res as { data?: unknown } | null | undefined)?.data
  return Array.isArray(data) ? (data as T[]) : []
}

/**
 * The `after` that starts the page following `rows`, or `undefined` when
 * `rows` is the end. Only an empty collection ends a walk — the pagination
 * page says a response holds "`0` to `n` resources. The upper limit will
 * probably be different depending on the endpoint.", so a page shorter than
 * `page_size` is not the last. The cursor is `version.max` ("or `null` when
 * the result set is empty"), else the highest `version` among the rows
 * themselves ("Auto-incrementing object version number."), for a response
 * without the collection's `version` object.
 */
function nextAfter(res: unknown, rows: unknown[]): number | undefined {
  if (rows.length === 0) return undefined
  const max = toVersion((res as { version?: { max?: unknown } } | null)?.version?.max)
  if (max !== undefined) return max
  const versions = rows
    .map((r) => toVersion((r as { version?: unknown } | null)?.version))
    .filter((v): v is number => v !== undefined)
  return versions.length > 0 ? Math.max(...versions) : undefined
}

export class LightspeedInventoryClient {
  private http: AxiosInstance
  /** The connection's pager scope: its store plus a fingerprint of its tokens. */
  private scope: string

  constructor(credentials: Credentials) {
    const domainPrefix = String(credentials.extra?.domainPrefix ?? '')
    if (!domainPrefix) throw new Error('lightspeed-inventory: credentials.extra.domainPrefix is required')
    this.scope = connectionScope(domainPrefix, credentials)
    this.http = axios.create({
      baseURL: buildBaseUrl(domainPrefix),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /**
   * One caller page of a list endpoint: page `params.page` at `page_size =
   * params.limit` (at most {@link MAX_PAGE_SIZE}), one upstream request per
   * page on a sequential walk.
   *
   * The version keyset has no offset, so page N is reached through the `after`
   * cursors of pages 1..N-1, which the shared cursor pager remembers per
   * connection, collection, filter and page size.
   *
   * Only an empty collection ends a walk: a response holds "`0` to `n`
   * resources. The upper limit will probably be different depending on the
   * endpoint.", and "some queries are limited", so a page shorter than
   * `page_size` is not proof of the end. A full page reports `hasMore: true`
   * and the next caller page asks. A short one asks for one row past it, and
   * reports `hasMore: false` only when that comes back empty — the request
   * the next caller page would otherwise make to learn the same thing.
   *
   * Reports `pageSize` when it sent less than `params.limit` (a direct call
   * past the maximum), so every short-page judgement uses the size sent.
   */
  async listPage<T>(
    path: string,
    params: QueryParams,
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const pageSize = pageSizeOf(params)
    const key = cursorPagerKey(this.scope, path, { ...filters, page_size: pageSize })
    const { items, hasMore } = await pageByCursor<T, number>(key, params.page, async (after) => {
      const { rows, next } = await this.fetchPage<T>(path, filters, pageSize, after)
      if (next === undefined || rows.length >= pageSize) return { items: rows, next }
      const peek = await this.fetchPage<T>(path, filters, 1, next)
      return { items: rows, next: peek.rows.length > 0 ? next : undefined }
    })
    const asked = Number(params.limit)
    reportUpstreamPage(params, { hasMore, ...(pageSize < asked ? { pageSize } : {}) })
    return items
  }

  /**
   * The rows after `after`, and the `after` that starts the page following
   * them (`undefined` once the collection is empty).
   *
   * Versions only increase and `after` is exclusive, so a non-empty page's
   * cursor is always past the one that fetched it. One that is not means the
   * upstream did not honour `after`: following it would serve rows again or
   * loop, and ending there would pass a truncated collection off as whole.
   * So it throws.
   */
  private async fetchPage<T>(
    path: string,
    filters: Record<string, string>,
    pageSize: number,
    after: number | undefined,
  ): Promise<{ rows: T[]; next: number | undefined }> {
    const res = await this.get<unknown>(path, {
      page_size: pageSize,
      ...filters,
      ...(after !== undefined ? { after } : {}),
    })
    const rows = collectionOf<T>(res)
    const next = nextAfter(res, rows)
    if (next !== undefined && after !== undefined && !(next > after)) {
      throw new Error(
        `lightspeed-inventory: GET ${path}?after=${after} answered version ${next}, ` +
          'which does not advance the version cursor',
      )
    }
    return { rows, next }
  }
}
