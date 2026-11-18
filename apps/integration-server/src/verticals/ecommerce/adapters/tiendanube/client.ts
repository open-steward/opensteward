/**
 * Tiendanube / Nuvemshop REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {access_token}` auth header.
 *  - Required `User-Agent` header (Tiendanube enforces this).
 *  - Page-based pagination: `page` (1-indexed) and `per_page` parameters.
 *    The `Link` response header signals prev/next pages.
 *  - Simple 429 retry with exponential backoff via `withRetry`.
 *
 * Tiendanube does NOT use cursor-based pagination — it uses plain integer
 * page numbers. The `listPage` helper returns the current page's items and
 * a boolean indicating whether more pages are available.
 *
 * Docs: https://tiendanube.github.io/api-documentation/intro
 */

import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'
import { buildApiBaseUrl, type TiendanubeRegion } from './auth'

/**
 * Parse the RFC 5988 `Link` header to detect whether there is a `rel="next"`
 * link. Tiendanube uses this header to indicate additional pages.
 *
 * Example:
 *   Link: <https://api.tiendanube.com/…?page=2&per_page=30>; rel="next"
 */
export function hasNextPage(linkHeader: string | undefined): boolean {
  if (!linkHeader) return false
  return /rel="next"/i.test(linkHeader)
}

export interface ListResult<T> {
  items: T[]
  hasMore: boolean
  page: number
}

export class TiendanubeClient {
  private http: AxiosInstance
  readonly storeId: string

  constructor(
    credentials: Credentials & { storeId?: string },
    appName: string = 'OpenSteward',
    region: TiendanubeRegion = 'es',
  ) {
    // storeId may live on the credentials object (extended type) or be passed separately
    this.storeId = credentials.storeId ?? ''
    this.http = axios.create({
      baseURL: buildApiBaseUrl(this.storeId, region),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'User-Agent': `${appName} (noreply@opensteward.io)`,
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

  async getRaw<T>(path: string, params?: Record<string, unknown>): Promise<AxiosResponse<T>> {
    return withRetry(async () => {
      return await this.http.get<T>(path, { params })
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
   * List helper for Tiendanube's page-based pagination. Returns the items
   * for the requested page and whether additional pages exist.
   */
  async listPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const page = (extraParams.page as number) ?? 1
    const params: Record<string, unknown> = {
      page,
      per_page: Math.min((extraParams.per_page as number) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...extraParams,
    }
    // Remove `page` and `per_page` from `extraParams` so they don't duplicate
    delete params['page']
    delete params['per_page']
    params.page = page
    params.per_page = Math.min(
      (extraParams.per_page as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )

    const res = await this.getRaw<T[]>(path, params)
    const link = (res.headers['link'] ?? res.headers['Link']) as string | undefined
    return {
      items: Array.isArray(res.data) ? res.data : [],
      hasMore: hasNextPage(link),
      page,
    }
  }
}
