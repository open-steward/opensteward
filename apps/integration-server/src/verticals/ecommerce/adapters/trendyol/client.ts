/**
 * Trendyol Partner API client.
 *
 * Features:
 *  - HTTP Basic auth header built from API key + API secret (base64-encoded).
 *  - Mandatory User-Agent header: "{supplierId} - SelfIntegration".
 *  - supplierId embedded in URL paths for all seller-scoped endpoints.
 *  - Retries with exponential back-off on 429 and 5xx (rate limit: 50
 *    requests / 10 seconds per endpoint).
 *  - `listWithPage` helper for Trendyol's standard page-based pagination
 *    response envelope `{ content, page, size, totalPages, totalElements }`.
 *
 * Docs: https://developers.trendyol.com/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildAuthHeader, buildUserAgent } from './auth'
import { PROD_BASE_URL, STAGE_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        // Respect Retry-After if present on 429
        const retryAfter = axiosErr.response?.headers?.['retry-after']
        const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Page-based list response envelope returned by Trendyol's listing endpoints.
 *
 * Example (orders):
 *   GET /integration/order/sellers/{sellerId}/orders
 *   → { content: [...], page: 0, size: 50, totalPages: 3, totalElements: 120 }
 */
export interface TrendyolPagedResponse<T> {
  content: T[]
  page: number
  size: number
  totalPages: number
  totalElements: number
}

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

export class TrendyolClient {
  private http: AxiosInstance
  readonly supplierId: string
  readonly baseUrl: string

  constructor(credentials: Credentials, env: 'prod' | 'stage' = 'prod') {
    const apiKey = credentials.accessToken
    const apiSecret = credentials.extra?.['apiSecret'] as string | undefined
    const supplierId = credentials.extra?.['supplierId'] as string | undefined

    if (!apiSecret) {
      throw new Error('TrendyolClient: credentials.extra.apiSecret is required')
    }
    if (!supplierId) {
      throw new Error('TrendyolClient: credentials.extra.supplierId is required')
    }

    this.supplierId = supplierId
    this.baseUrl = env === 'stage' ? STAGE_BASE_URL : PROD_BASE_URL

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: buildAuthHeader(apiKey, apiSecret),
        'User-Agent': buildUserAgent(supplierId),
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

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * List helper for Trendyol's standard page-based pagination envelope.
   *
   * Trendyol returns `{ content: T[], page, size, totalPages, totalElements }`.
   * The `page` parameter is 0-based.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const size = Math.min(
      (extraParams['size'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    // Trendyol uses 0-based page index; callers may pass 1-based via QueryParams.
    const rawPage = (extraParams['page'] as number | undefined) ?? 0
    // Normalise: if caller sends 1-based (≥1 and not obviously already 0-indexed
    // by the adapter), pass through as-is. We use 0-based internally.
    const page = rawPage > 0 ? rawPage - 1 : 0

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['size'] = size
    params['page'] = page

    const res = await this.get<TrendyolPagedResponse<T>>(path, params)
    const items: T[] = res.content ?? []
    const totalPages = res.totalPages
    const currentPage = res.page ?? page
    const nextPage = currentPage + 1 < totalPages ? currentPage + 1 : undefined

    return {
      items,
      nextPage: nextPage != null ? nextPage + 1 : undefined, // back to 1-based for callers
      totalPages,
      totalItems: res.totalElements,
    }
  }
}
