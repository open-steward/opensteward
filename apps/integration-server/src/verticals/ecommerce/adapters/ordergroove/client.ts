/**
 * Ordergroove REST API client.
 *
 * Auth: `x-api-key` request header — "Authentication via an x-api-key header
 * that uses one of 10 keys available for your store"
 * (https://developer.ordergroove.com/reference/authentication). Requests
 * must be HTTPS.
 *
 * Pagination: cursor-based, switched on per request by the
 * `X-OG-API-VERSION: 2` header — "To use cursor-based pagination, include the
 * following header in your request"
 * (https://developer.ordergroove.com/reference/pagination). List responses are
 * `{ next, previous, results }` ("Cursor-based pagination does not provide the
 * count attribute in the response"); `next`/`previous` are full URLs "with a
 * cursor parameter for fetching subsequent or previous pages". The documented
 * example `next` carries `cursor` and the filters but not `page_size`, so
 * `listWithCursor` takes the whole query string of `next` as the opaque
 * cursor and lays it over the request's own params — `page_size` is re-sent
 * every page, and a `next` that pages some other way (a legacy `?page=2`)
 * is still followed rather than dropped.
 *
 * Retries: wrapped with the shared `withRetry`, which backs off on HTTP 429 —
 * matching "6,000 requests per IP per minute... failed requests may be
 * safely retried" (https://developer.ordergroove.com/reference/ordergroove-api-rate-limits).
 */
import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, STAGING_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListEnvelope<T> {
  count?: number
  next?: string | null
  previous?: string | null
  results: T[]
}

export interface ListResult<T> {
  items: T[]
  totalCount?: number
  nextCursor?: string
  /** The query string of the `next` URL; absent on the last page. */
  next?: string
}

/** The header that turns on cursor pagination for a list request. */
export const CURSOR_PAGINATION_HEADERS = { 'X-OG-API-VERSION': '2' } as const

/** The query string of an Ordergroove `next` URL, or undefined when there is none. */
export function parseNextQuery(nextUrl: string | null | undefined): string | undefined {
  if (!nextUrl) return undefined
  try {
    const query = new URL(nextUrl).search.replace(/^\?/, '')
    return query || undefined
  } catch {
    return undefined
  }
}

/** Extract the `cursor` query parameter from an Ordergroove `next` URL. */
export function parseNextCursor(nextUrl: string | null | undefined): string | undefined {
  if (!nextUrl) return undefined
  try {
    return new URL(nextUrl).searchParams.get('cursor') ?? undefined
  } catch {
    return undefined
  }
}

export class OrdergrooveClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    if (!apiKey) {
      throw new Error('OrdergrooveClient: credentials.accessToken (x-api-key) is required.')
    }
    const sandbox = credentials.extra?.['sandbox'] === true
    const baseURL = sandbox ? STAGING_BASE_URL : PRODUCTION_BASE_URL

    this.http = axios.create({
      baseURL,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, headers ? { params, headers } : { params })
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  /**
   * List helper for Ordergroove's cursor pagination.
   *
   * @param path e.g. `/products/`
   * @param extraParams additional query params (`page_size`, filters)
   * @param next the `next` query string of the previous page (see
   *   {@link parseNextQuery}); absent for page 1
   */
  async listWithCursor<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
    next?: string,
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams['page_size'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const params: Record<string, unknown> = { ...extraParams }
    if (next) for (const [k, v] of new URLSearchParams(next)) params[k] = v
    params['page_size'] = pageSize

    const data = await this.get<ListEnvelope<T> | T[]>(path, params, { ...CURSOR_PAGINATION_HEADERS })
    // Defensive: fall back to a bare array if an endpoint ever returns one
    // (e.g. the `orders-list` doc example shows only `results`, no envelope
    // fields, for at least one response shape).
    if (Array.isArray(data)) {
      return { items: data }
    }
    return {
      items: data.results ?? [],
      totalCount: data.count,
      nextCursor: parseNextCursor(data.next),
      next: parseNextQuery(data.next),
    }
  }
}
