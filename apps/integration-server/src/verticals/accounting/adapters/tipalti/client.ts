/**
 * Tipalti REST API HTTP client.
 *
 * Base URL  : https://api-p.tipalti.com/api/v1  (production)
 *           : https://api-sb.tipalti.com/api/v1  (sandbox)
 * Auth      : Bearer <access_token>
 * Pagination: cursor-based — pass `page-size` and `page-cursor` query params;
 *             response envelope: { items: T[], pageInfo: { hasNextPage, nextPageCursor }, totalCount }
 *
 * Docs: https://documentation.tipalti.com/reference/pagination-1
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '../../adapter/interface'
import { apiBaseUrl, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type TipaltiEnvironment } from './constants'
import { environmentOf } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Cursor-paginated list envelope returned by Tipalti collection endpoints.
 * The real API returns `items` (not `data`), plus `pageInfo` and `totalCount`.
 */
export interface TipaltiPage<T> {
  totalCount?: number
  /** Nullable in every list endpoint's OpenAPI, as is `nextPageCursor`. */
  pageInfo?: {
    hasNextPage?: boolean
    nextPageCursor?: string | null
  } | null
  items?: T[]
}

export interface TipaltiListParams {
  /** 1..200 — Tipalti rejects larger page sizes with a 400. */
  pageSize?: number
  pageCursor?: string
  /** ISO-8601 datetime — filter to records updated after this timestamp. */
  updatedAfter?: string
}

export class TipaltiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, _sandbox?: boolean) {
    // Derive environment from stored credentials rather than a separate flag,
    // so that credentials.extra.environment is always the source of truth.
    const env: TipaltiEnvironment = environmentOf(credentials)
    this.http = axios.create({
      baseURL: apiBaseUrl(env),
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

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
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
   * Fetch a single page from a paginated list endpoint.
   * Maps canonical params onto the hyphenated wire param names that Tipalti
   * requires (`page-size`, `page-cursor`). MAX_PAGE_SIZE is capped at 200.
   */
  async list<T>(path: string, params: TipaltiListParams = {}): Promise<TipaltiPage<T>> {
    const size = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = { 'page-size': size }
    if (params.pageCursor) query['page-cursor'] = params.pageCursor
    if (params.updatedAfter) query['updatedAfter'] = params.updatedAfter
    return this.get<TipaltiPage<T>>(path, query)
  }
}
