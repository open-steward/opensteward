/**
 * BigCommerce REST API client.
 *
 * Features:
 *  - `X-Auth-Token` auth header (NOT `Authorization: Bearer`).
 *  - Simple 429 retry with exponential backoff.
 *  - Page-based pagination using `?page=N&limit=N` with `meta.pagination`
 *    in response body.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

export interface ListResult<T> {
  items: T[]
  nextPage?: number
}

export class BigCommerceClient {
  private v3: AxiosInstance
  private v2: AxiosInstance

  constructor(credentials: Credentials, storeHash: string) {
    const baseHeaders = {
      'X-Auth-Token': credentials.accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    this.v3 = axios.create({
      baseURL: `https://api.bigcommerce.com/stores/${storeHash}/v3`,
      headers: baseHeaders,
      timeout: 30_000,
    })

    this.v2 = axios.create({
      baseURL: `https://api.bigcommerce.com/stores/${storeHash}/v2`,
      headers: baseHeaders,
      timeout: 30_000,
    })
  }

  // ── v3 methods ──────────────────────────────────────────────────────────

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v3.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v3.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v3.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.v3.delete(path)
    })
  }

  /**
   * v3 list helper with page-based pagination. BigCommerce wraps v3 list
   * responses in `{ data: [...], meta: { pagination: { ... } } }`.
   */
  async listV3<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams.limit as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams.page as number) ?? 1
    const params: Record<string, unknown> = { ...extraParams, limit, page }

    const res = await this.get<{
      data: T[]
      meta?: { pagination?: { current_page?: number; total_pages?: number } }
    }>(path, params)

    const currentPage = res.meta?.pagination?.current_page ?? page
    const totalPages = res.meta?.pagination?.total_pages ?? 1
    const nextPage = currentPage < totalPages ? currentPage + 1 : undefined

    return {
      items: res.data ?? [],
      nextPage,
    }
  }

  // ── v2 methods ──────────────────────────────────────────────────────────

  async getV2<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v2.get<T>(path, { params })
      return data
    })
  }

  async postV2<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v2.post<T>(path, body)
      return data
    })
  }

  async putV2<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v2.put<T>(path, body)
      return data
    })
  }

  async deleteV2(path: string): Promise<void> {
    return withRetry(async () => {
      await this.v2.delete(path)
    })
  }

  /**
   * v2 list helper. BigCommerce v2 returns a plain array (no envelope),
   * with pagination via `?page=N&limit=N`. Total count is in the
   * `X-Total-Count` header (not always reliable), so we detect the end
   * when fewer items than `limit` are returned.
   */
  async listV2<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams.limit as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams.page as number) ?? 1
    const params: Record<string, unknown> = { ...extraParams, limit, page }

    const items = await this.getV2<T[]>(path, params)
    const arr = Array.isArray(items) ? items : []
    const nextPage = arr.length >= limit ? page + 1 : undefined

    return {
      items: arr,
      nextPage,
    }
  }
}
