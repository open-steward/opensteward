/**
 * EverShop REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <jwt>` header.
 *  - Simple 429 / 5xx retry with exponential backoff.
 *  - `listWithPage` helper that reads EverShop's page-based pagination
 *    metadata (`currentPage`, `lastPage`) and returns the next page number
 *    so callers can iterate deterministically.
 *
 * EverShop wraps every response in a `{ data: <resource>, links: [...] }`
 * envelope. List responses use:
 *   `{ data: { items: [...], total: N, currentPage: N, lastPage: N } }`.
 *
 * Docs: https://evershop.io/docs/api/overview
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Normalised list result returned to adapter methods. */
export interface ListResult<T> {
  items: T[]
  /** Next page number, or undefined if we are on the last page. */
  nextPage?: number
  totalItems?: number
}

export class EverShopClient {
  private http: AxiosInstance
  /** Store root, e.g. https://shop.example.com */
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
    if (!baseUrl) {
      throw new Error('EverShopClient: credentials.extra.baseUrl is required')
    }
    this.baseUrl = baseUrl.replace(/\/$/, '')

    this.http = axios.create({
      baseURL: `${this.baseUrl}/api`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** GET and unwrap the `data` envelope. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ data: T }>(path, { params })
      return data.data
    })
  }

  /** POST and unwrap the `data` envelope. */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<{ data: T }>(path, body)
      return data.data
    })
  }

  /** PATCH and unwrap the `data` envelope. */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<{ data: T }>(path, body)
      return data.data
    })
  }

  /** DELETE — EverShop returns the deleted resource in `data`. */
  async deleteReturning<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<{ data: T }>(path)
      return data.data
    })
  }

  /**
   * List helper that drives EverShop's page-based pagination.
   *
   * EverShop list responses look like:
   * ```json
   * { "data": { "items": [...], "total": 42, "currentPage": 1, "lastPage": 3 } }
   * ```
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams, page, limit }

    interface EverShopListData {
      items: T[]
      total: number
      currentPage: number
      lastPage: number
    }
    const res = await withRetry(async () => {
      const { data } = await this.http.get<{ data: EverShopListData }>(path, { params })
      return data
    })

    const listData = res.data
    const currentPage = listData.currentPage ?? page
    const lastPage = listData.lastPage ?? 1

    return {
      items: listData.items ?? [],
      nextPage: currentPage < lastPage ? currentPage + 1 : undefined,
      totalItems: listData.total,
    }
  }
}
