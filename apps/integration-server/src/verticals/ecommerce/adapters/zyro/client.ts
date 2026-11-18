/**
 * Zyro REST API client.
 *
 * Features:
 *  - Bearer token authentication (standard OAuth2 `Authorization: Bearer <token>`).
 *  - Offset-based pagination via `page` / `limit` query parameters.
 *  - Exponential backoff on 429 (rate-limit) and 5xx responses.
 *  - 30-second request timeout.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (status !== undefined && RETRYABLE_STATUS_CODES.has(status) && attempt < retries) {
        const backoffMs = Math.pow(2, attempt) * 1000
        await new Promise<void>((resolve) => setTimeout(resolve, backoffMs))
        continue
      }
      throw err
    }
  }
  // unreachable
  throw new Error('withRetry: exhausted all attempts')
}

export interface PagedResult<T> {
  items: T[]
  total?: number
  page: number
  limit: number
}

export interface ListOptions {
  page?: number
  limit?: number
  [key: string]: unknown
}

export class ZyroClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Paginated GET request. Zyro uses standard `page` (1-indexed) and `limit`
   * query parameters. The response envelope is expected to be:
   *
   * ```json
   * {
   *   "items": [...],
   *   "total": 100,
   *   "page": 1,
   *   "limit": 50
   * }
   * ```
   *
   * If the API returns the resource array directly (no envelope), pass
   * `resourceKey` as an empty string and the raw array will be returned as
   * `items`.
   */
  async list<T>(
    path: string,
    resourceKey: string,
    opts: ListOptions = {},
  ): Promise<PagedResult<T>> {
    const page = (opts.page as number) ?? 1
    const limit = Math.min((opts.limit as number) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    // Build extra query params (filter out pagination keys that we handle)
    const extraParams: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(opts)) {
      if (k !== 'page' && k !== 'limit') {
        extraParams[k] = v
      }
    }

    const params: Record<string, unknown> = { page, limit, ...extraParams }
    const response = await this.get<Record<string, unknown>>(path, params)

    // Handle both envelope and bare-array responses
    let items: T[]
    let total: number | undefined
    if (Array.isArray(response)) {
      items = response as T[]
    } else if (resourceKey && Array.isArray(response[resourceKey])) {
      items = response[resourceKey] as T[]
      total = typeof response['total'] === 'number' ? response['total'] : undefined
    } else if (Array.isArray(response['items'])) {
      items = response['items'] as T[]
      total = typeof response['total'] === 'number' ? response['total'] : undefined
    } else {
      items = []
    }

    return { items, total, page, limit }
  }
}
