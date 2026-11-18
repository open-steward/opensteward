/**
 * Quickbutik REST API v1 client.
 *
 * Features:
 *  - HTTP Basic auth: `api_key:api_key` (same key for username + password).
 *  - Offset/limit pagination via `listWithOffset` helper.
 *  - 429 / 5xx retry with exponential backoff.
 *
 * Docs: https://quickbutik.dev/api-v1/introduction
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE_PRODUCTS } from './constants'

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
  /** Offset to pass for the next page, or undefined if no more pages. */
  nextOffset?: number
}

export class QuickbutikClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    if (!apiKey) {
      throw new Error(
        'QuickbutikClient: credentials.accessToken (API key) is required',
      )
    }
    // Quickbutik uses HTTP Basic Auth with the same key as username and password.
    const basic = Buffer.from(`${apiKey}:${apiKey}`).toString('base64')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${basic}`,
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
   * Offset-based list helper for Quickbutik.
   *
   * Quickbutik uses `limit` + `offset` pagination. After fetching, if
   * the number of items returned equals the page size there may be more
   * pages — we return the next offset so the caller can continue.
   *
   * The `unwrap` callback extracts the array from the envelope (e.g.
   * products come back as `{ product: [...] }` or `[...]` depending on
   * query parameters).
   */
  async listWithOffset<TRaw, TEnvelope>(
    path: string,
    params: Record<string, unknown>,
    unwrap: (data: TEnvelope) => TRaw[],
    maxPageSize: number = MAX_PAGE_SIZE_PRODUCTS,
  ): Promise<ListResult<TRaw>> {
    const limit = Math.min(
      (params['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      maxPageSize,
    )
    const offset = (params['offset'] as number | undefined) ?? 0

    const queryParams: Record<string, unknown> = { ...params, limit, offset }
    const data = await this.get<TEnvelope>(path, queryParams)
    const items = unwrap(data)

    return {
      items,
      nextOffset: items.length === limit ? offset + limit : undefined,
    }
  }
}
