/**
 * ManoMano Partners REST API client.
 *
 * Features:
 *  - `x-api-key` auth header — API key stored in credentials.accessToken.
 *  - Exponential backoff retry on HTTP 429 and 5xx (max 4 attempts).
 *  - `listWithPage` helper for the page-based pagination used by ManoMano:
 *    query params `page` (1-indexed) and `limit`. The API returns the total
 *    count in the response body (`total` or `count`), from which callers can
 *    derive the next page number.
 *
 * Docs: https://www.manomano.dev/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
  nextPage?: number
  total?: number
}

export class ManomanoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'x-api-key': credentials.accessToken,
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

  /**
   * Page-based list helper. ManoMano list responses follow the shape:
   *
   *   { content: [...], pagination: { items: 120, ... } }
   *
   * All list endpoints wrap results in a `content` array with a `pagination`
   * object that carries `items` (total item count across all pages).
   * `extraParams` may include filter parameters (e.g. `seller_contract_id`,
   * `status`, date filters).
   */
  async listWithPage<T>(
    path: string,
    _resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams, limit, page }
    delete params['limit'] // normalise: ManoMano uses `limit` directly
    params['limit'] = limit
    params['page'] = page

    const res = await this.get<Record<string, unknown>>(path, params)

    // Real ManoMano envelope: { content: [...], pagination: { items: N, ... } }
    const items = (res['content'] ?? []) as T[]
    const pagination = res['pagination'] as Record<string, unknown> | undefined
    const total = pagination != null ? (pagination['items'] as number | undefined) : undefined
    const nextPage = total != null && page * limit < total ? page + 1 : undefined

    return { items, nextPage, total }
  }
}
