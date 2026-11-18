/**
 * Shoplazza Admin REST API client.
 *
 * Features:
 *  - `Access-Token` auth header (per Shoplazza docs).
 *  - Cursor-based pagination: response body carries `cursor` and `has_more`.
 *  - Simple 429/5xx retry with exponential backoff via the shared `withRetry`.
 *
 * Base URL: https://{shop}.myshoplaza.com/openapi/{version}/
 *
 * Docs: https://www.shoplazza.dev/docs/app/shoplazza-api-overview/pagination
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_VERSION, API_PREFIX, HOST_SUFFIX, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  /** Opaque cursor to pass as `?cursor=` for the next page, if any. */
  nextCursor?: string
}

/**
 * Shape of Shoplazza paginated list envelopes.
 * The outer key varies per resource (e.g. `{ products: [...], cursor: '...', has_more: true }`).
 */
interface PaginatedEnvelope {
  cursor?: string | null
  has_more?: boolean
  [key: string]: unknown
}

function shopHost(shop: string): string {
  return shop.endsWith(`.${HOST_SUFFIX}`) ? shop : `${shop}.${HOST_SUFFIX}`
}

export class ShoplazzaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, shop: string) {
    const host = shopHost(shop)
    this.http = axios.create({
      baseURL: `https://${host}/${API_PREFIX}/${API_VERSION}`,
      headers: {
        'Access-Token': credentials.accessToken,
        'Content-Type': 'application/json',
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

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Cursor-based list helper.
   *
   * Shoplazza returns paginated resources as:
   *   `{ <resourceKey>: [...], cursor: "opaque", has_more: true }`
   *
   * Pass `cursor` in `extraParams` to fetch a subsequent page.
   */
  async listWithCursor<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const params: Record<string, unknown> = {
      limit: Math.min((extraParams['limit'] as number) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...extraParams,
    }

    const envelope = await this.get<PaginatedEnvelope>(path, params)
    const items = (envelope[resourceKey] ?? []) as T[]
    const nextCursor =
      envelope.has_more && envelope.cursor ? String(envelope.cursor) : undefined

    return { items, nextCursor }
  }

  /**
   * One page of a 2025-06 list, sending exactly `params` (no defaults added).
   *
   * Every 2025-06 list nests its rows and paging fields under `data`:
   * `{ code, message, data: { cursor, has_more, total?, <resourceKey>: [...] } }`
   * (e.g. https://www.shoplazza.dev/api/202506/products). A body without a
   * `data` object is read at the top level.
   */
  async listOnePage<T>(
    path: string,
    resourceKey: string,
    params: Record<string, unknown>,
  ): Promise<ListPage<T>> {
    const body = await this.get<PaginatedEnvelope>(path, params)
    const inner =
      body.data !== null && typeof body.data === 'object' && !Array.isArray(body.data)
        ? (body.data as PaginatedEnvelope)
        : body
    const items = (Array.isArray(inner[resourceKey]) ? inner[resourceKey] : []) as T[]
    const hasMore = typeof inner.has_more === 'boolean' ? inner.has_more : undefined
    const nextCursor = hasMore && inner.cursor ? String(inner.cursor) : undefined
    const total = typeof inner.total === 'number' ? inner.total : undefined
    return {
      items,
      ...(hasMore !== undefined ? { hasMore } : {}),
      ...(nextCursor !== undefined ? { nextCursor } : {}),
      ...(total !== undefined ? { total } : {}),
    }
  }
}

export interface ListPage<T> {
  items: T[]
  /** `data.has_more`, when the platform sent it. */
  hasMore?: boolean
  /** `data.cursor` when `has_more` is true: the cursor that starts the next page. */
  nextCursor?: string
  /** `data.total` (page mode), when the platform sent it. */
  total?: number
}
