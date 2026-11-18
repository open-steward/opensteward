/**
 * X-Cart REST API client.
 *
 * Features:
 *  - API key auth via `X-Auth-Token` header (static key, never rotated).
 *  - `baseUrl` taken from `credentials.extra.baseUrl` (e.g. `https://mystore.example.com`).
 *  - Retries with exponential backoff on 429 and 5xx responses.
 *  - Page-based pagination helpers matching the X-Cart REST API convention
 *    (`?page=N&limit=N`). The API returns total-count in an `X-Total-Count`
 *    response header.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PREFIX, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
  total?: number
  nextPage?: number
}

export class XCartClient {
  private http: AxiosInstance
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const base = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('XCartClient: credentials.accessToken (API key) is required')
    }
    if (!base) {
      throw new Error(
        'XCartClient: credentials.extra.baseUrl is required (e.g. https://mystore.example.com)',
      )
    }

    this.baseUrl = `${base.replace(/\/$/, '')}${API_PREFIX}`
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-Auth-Token': token,
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

  async getRaw<T>(path: string, params?: Record<string, unknown>) {
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
   * List helper that reads X-Cart's page-based pagination.
   * X-Cart uses `?page=N&limit=N`. The total item count is carried in the
   * `X-Total-Count` response header (some X-Cart versions also use
   * `Content-Range`). The next page is inferred from the returned item
   * count vs. page size.
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

    const params: Record<string, unknown> = { ...extraParams, limit, page }

    const res = await this.getRaw<T[]>(path, params)
    const items = Array.isArray(res.data) ? res.data : []

    const totalHeader =
      (res.headers['x-total-count'] as string | undefined) ??
      (res.headers['X-Total-Count'] as string | undefined)
    const total = totalHeader ? parseInt(totalHeader, 10) : undefined

    const hasNextPage = items.length >= limit
    const nextPage = hasNextPage ? page + 1 : undefined

    return { items, total, nextPage }
  }
}
