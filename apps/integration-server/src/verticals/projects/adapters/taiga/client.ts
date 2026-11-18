/**
 * Taiga REST client.
 *
 * Authentication: Authorization: Bearer <token> on every request.
 * Pagination: page-based via `page` query param.
 *   Response headers: x-pagination-count (total), x-paginated-by (per page),
 *   x-pagination-next / x-pagination-prev (URLs for next/prev pages).
 *   Pass `x-disable-pagination: True` to retrieve all results at once (used
 *   internally for small collections like project members / tags).
 * Rate limit: 429 + 5xx trigger exponential backoff.
 *
 * Docs: https://docs.taiga.io/api.html
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class TaigaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = (credentials.extra?.['baseUrl'] as string | undefined) || API_BASE_URL
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  /**
   * Paginated GET — returns one page worth of results.
   * Uses Taiga's page-number pagination: ?page=N&page_size=M
   */
  async getPage<T>(
    path: string,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    extraParams?: Record<string, unknown>,
  ): Promise<T[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<T[]>(path, {
        params: { page, page_size: pageSize, ...extraParams },
      })
      return Array.isArray(data) ? data : []
    })
  }

  /**
   * One page of a paginated list, with what Taiga said about the pages
   * around it: `hasNext` is the presence of the `x-pagination-next` header
   * and `count` is `x-pagination-count` when sent.
   *
   * Taiga answers a page number past the last page with 404 ("Invalid
   * page"); for `page > 1` that is reported as an empty last page, since
   * page 1 of the same query would have answered first.
   */
  async getPageWithMeta<T>(
    path: string,
    page: number,
    pageSize: number,
    extraParams?: Record<string, unknown>,
  ): Promise<{ items: T[]; hasNext: boolean; count?: number }> {
    return withRetry(async () => {
      try {
        const res = await this.http.get<T[]>(path, {
          params: { page, page_size: pageSize, ...extraParams },
        })
        const headers = (res.headers ?? {}) as Record<string, unknown>
        const next = headers['x-pagination-next']
        const rawCount = Number(headers['x-pagination-count'])
        return {
          items: Array.isArray(res.data) ? res.data : [],
          hasNext: typeof next === 'string' && next.length > 0,
          ...(Number.isInteger(rawCount) && rawCount >= 0 ? { count: rawCount } : {}),
        }
      } catch (err) {
        if (page > 1 && (err as AxiosError).response?.status === 404) {
          return { items: [], hasNext: false }
        }
        throw err
      }
    })
  }

  /**
   * Fetch all pages by disabling Taiga's server-side pagination.
   * Safe for small collections (tags, members, webhooks).
   */
  async getAll<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<T[]>(path, {
        params,
        headers: { 'x-disable-pagination': 'True' },
      })
      return Array.isArray(data) ? data : []
    })
  }
}
