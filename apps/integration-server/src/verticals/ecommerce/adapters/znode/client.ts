/**
 * Znode Commerce REST client.
 *
 * Key characteristics:
 *  - Standard REST JSON API under `/api/`.
 *  - Responses typically wrap data in an envelope: `{Product: {...}}`,
 *    `{Products: [...]}`, or `{TotalResults: N, PageIndex: N, ...}`.
 *  - Pagination uses `pageIndex` (1-indexed) + `pageSize` query params.
 *  - Updates use PUT (not PATCH).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CONTENT_TYPE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

// ── Retry helper ──────────────────────────────────────────────────────────────

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

// ── List result ───────────────────────────────────────────────────────────────

export interface ZnodeListResult<T> {
  items: T[]
  totalCount: number
  pageIndex: number
  pageSize: number
}

// ── Client ────────────────────────────────────────────────────────────────────

export class ZnodeClient {
  private http: AxiosInstance
  private baseApiUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const rawBase = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('ZnodeClient: credentials.accessToken is required')
    }
    if (!rawBase) {
      throw new Error(
        'ZnodeClient: credentials.extra.baseUrl is required (e.g. https://mystore.znode.com)',
      )
    }

    this.baseApiUrl = `${rawBase.replace(/\/$/, '')}/api`
    this.http = axios.create({
      baseURL: this.baseApiUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': CONTENT_TYPE,
        Accept: CONTENT_TYPE,
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a single resource. Returns the raw response data.
   */
  async get<T = Record<string, unknown>>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get(path, { params })
      return data as T
    })
  }

  /**
   * POST a new resource. Returns the raw response data.
   */
  async post<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post(path, body)
      return data as T
    })
  }

  /**
   * PUT an existing resource. Znode uses PUT for updates.
   */
  async put<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put(path, body)
      return data as T
    })
  }

  /**
   * DELETE a resource.
   */
  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List resources with pageIndex + pageSize pagination.
   * Znode returns `{TotalResults, PageIndex, ...}` in the envelope.
   */
  async list<T = Record<string, unknown>>(
    path: string,
    dataKey: string,
    options: {
      pageIndex?: number
      pageSize?: number
      filters?: Record<string, string>
    } = {},
  ): Promise<ZnodeListResult<T>> {
    const pageIndex = options.pageIndex ?? 1
    const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      pageIndex,
      pageSize,
    }
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        params[key] = value
      }
    }

    return withRetry(async () => {
      const { data } = await this.http.get(path, { params })
      const envelope = data as Record<string, unknown>
      const items = (envelope[dataKey] as T[] | undefined) ?? []
      const totalCount =
        (envelope['TotalResults'] as number | undefined) ??
        (envelope['totalResults'] as number | undefined) ??
        items.length
      return { items, totalCount, pageIndex, pageSize }
    })
  }
}
