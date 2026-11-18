/**
 * Instamojo REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <access_token>` auth header.
 *  - Simple 429 / 5xx retry with exponential backoff (via `withRetry`).
 *  - `listWithPage` helper that reads Instamojo's page-based pagination
 *    (query params `page` and `limit`; response body fields `total_count`
 *    and `pages`).
 *
 * Instamojo API base URLs:
 *   Production: https://api.instamojo.com/v2
 *   Sandbox:    https://test.instamojo.com/v2
 *
 * Docs: https://docs.instamojo.com/reference/overview-and-setup-1
 */

import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { PROD_API_BASE, SANDBOX_API_BASE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

export class InstamojoClient {
  private http: AxiosInstance
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const sandbox = (credentials.extra?.['sandbox'] as boolean | undefined) ?? false
    this.baseUrl = sandbox ? SANDBOX_API_BASE : PROD_API_BASE

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  async getRaw<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<AxiosResponse<T>> {
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

  async postForm<T>(
    path: string,
    fields: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const form = new URLSearchParams()
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) form.set(k, String(v))
    }
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper that follows Instamojo's page-based pagination.
   * Instamojo list responses wrap items inside an envelope keyed by
   * `resourceKey` (e.g. `payment_requests`).
   *
   * Query params: `page` (1-indexed), `limit` (items per page).
   * Pagination metadata (`total_count`, `pages`) is returned in the JSON
   * response body, not in HTTP response headers.
   */
  async listWithPage<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams, limit, page }

    const res = await this.getRaw<Record<string, unknown>>(path, params)

    const body = res.data
    const totalCountRaw = body['total_count']
    const pagesRaw = body['pages']

    const totalItems =
      totalCountRaw != null ? parseInt(String(totalCountRaw), 10) : undefined
    const totalPages =
      pagesRaw != null ? parseInt(String(pagesRaw), 10) : undefined
    const items = ((body[resourceKey] as T[] | undefined) ?? []) as T[]

    const nextPage = totalPages != null && page < totalPages ? page + 1 : undefined

    return { items, nextPage, totalPages, totalItems }
  }
}
