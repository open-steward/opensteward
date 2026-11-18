/**
 * Flipkart Seller API HTTP client.
 *
 * Key characteristics:
 *
 *  - Auth header is `Authorization: Bearer <token>` (standard OAuth2).
 *  - Pagination uses `nextPageUrl` in response — the full URL to fetch the
 *    next page. Our `listWithCursor` normalises this.
 *  - Retries follow exponential backoff on HTTP 429 and 5xx.
 *  - All requests go to `https://api.flipkart.net/sellers/`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

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

export interface ListResult<T> {
  items: T[]
  nextPageUrl?: string
}

export class FlipkartClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'FlipkartClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
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

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * List helper that handles Flipkart's `nextPageUrl` pagination.
   * The caller passes the initial path + params, and this helper returns
   * the items array plus the raw next page URL (if present).
   */
  async listWithCursor<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const params: Record<string, unknown> = {
      ...extraParams,
      pageSize: (extraParams['pageSize'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
    }

    const data = await this.get<Record<string, unknown>>(path, params)

    let items: T[] = []
    if (Array.isArray(data[resourceKey])) {
      items = data[resourceKey] as T[]
    }

    const nextPageUrl = (data['nextPageUrl'] as string | undefined) ?? undefined

    return { items, nextPageUrl }
  }
}
