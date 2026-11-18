/**
 * Shuup REST API client.
 *
 * Features:
 *  - DRF token auth via `Authorization: Token <token>` header.
 *  - `baseUrl` taken from `credentials.extra.baseUrl` (e.g. `https://myshop.example.com`).
 *  - Retries with exponential backoff on 429 and 5xx responses.
 *  - DRF cursor-based pagination helpers (`?page=N&page_size=N`).
 *    The API returns results in a `{ count, next, previous, results }` envelope.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SHUUP_PREFIX, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

/** DRF paginated envelope */
export interface DRFPage<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ListResult<T> {
  items: T[]
  total?: number
  nextPage?: number
}

export class ShuupClient {
  private http: AxiosInstance
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const base = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('ShuupClient: credentials.accessToken (DRF token) is required')
    }
    if (!base) {
      throw new Error(
        'ShuupClient: credentials.extra.baseUrl is required (e.g. https://myshop.example.com)',
      )
    }

    this.baseUrl = base.replace(/\/$/, '')
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Token ${token}`,
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
   * List helper that reads Shuup's DRF page-based pagination.
   * Shuup uses `?page=N&page_size=N`. The response envelope is
   * `{ count, next, previous, results }`.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams['page_size'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams, page_size: pageSize, page }

    const data = await this.get<DRFPage<T> | T[]>(path, params)

    // Handle both paginated envelope and raw array responses
    if (Array.isArray(data)) {
      return { items: data, total: data.length }
    }

    const envelope = data as DRFPage<T>
    const items = envelope.results ?? []
    const total = envelope.count
    const hasNextPage = envelope.next != null
    const nextPage = hasNextPage ? page + 1 : undefined

    return { items, total, nextPage }
  }

  /** Build the full path to a Shuup resource. */
  shuupPath(resource: string): string {
    return `${SHUUP_PREFIX}/${resource}/`
  }
}
