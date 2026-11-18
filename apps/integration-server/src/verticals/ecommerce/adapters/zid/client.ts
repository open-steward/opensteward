/**
 * Zid Merchant API REST client.
 *
 * Auth: every request needs two headers:
 *   - `Authorization: Bearer {access_token}`
 *   - `X-Manager-Token: {access_token}` (store-specific layer; same token)
 *
 * Pagination:
 *   - Manager store endpoints (/v1/managers/store/*) use `page` + `per_page`
 *     (max 100). Response envelope key matches resource name.
 *   - Product endpoint (/v1/products/) uses `page` + `page_size` with a
 *     `next` URL cursor in the response.
 *
 * Retry: 429 responses are retried with exponential backoff via `withRetry`.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  /** Next page number if more results exist; undefined when at last page. */
  nextPage?: number
}

export class ZidClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Manager-Token': credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Language': 'en',
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
   * Page-based list helper for Manager store endpoints.
   *
   * These endpoints wrap items in a named key (e.g. `"orders"`, `"customers"`,
   * `"categories"`). We detect the last page when fewer items than `per_page`
   * are returned.
   */
  async listPage<T>(
    path: string,
    envelopeKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams.per_page as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams.page as number) ?? 1
    const params: Record<string, unknown> = { ...extraParams, per_page: limit, page }

    const res = await this.get<Record<string, unknown>>(path, params)
    const items = (res[envelopeKey] as T[] | undefined) ?? []
    const nextPage = items.length >= limit ? page + 1 : undefined

    return { items, nextPage }
  }

  /**
   * Cursor-based list helper for the storefront product endpoint (/v1/products/).
   *
   * Response envelope: `{ results: [...], next: "url|null", count: N }`
   */
  async listProducts<T>(extraParams: Record<string, unknown> = {}): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams.page_size as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams.page as number) ?? 1
    const params: Record<string, unknown> = { ...extraParams, page_size: limit, page }

    const res = await this.get<{ results?: T[]; next?: string | null; count?: number }>(
      '/products/',
      params,
    )
    const items = res.results ?? []
    // `next` is a full URL string when more pages exist, null/undefined otherwise.
    const nextPage = res.next ? page + 1 : undefined
    return { items, nextPage }
  }
}
