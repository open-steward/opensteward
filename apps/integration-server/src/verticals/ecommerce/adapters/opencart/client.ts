/**
 * OpenCart REST API client.
 *
 * Features:
 *  - API key authentication via `X-Oc-Restadmin-Id` header (OpenCart REST
 *    admin module convention) with the API token obtained via login.
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithPage` helper for offset-based pagination.
 *
 * OpenCart's REST API uses `index.php?route=rest/<resource>` as the
 * base path. Authentication requires first obtaining a session token
 * via the login endpoint, then passing it in subsequent requests.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
  totalItems?: number
}

export class OpenCartClient {
  private http: AxiosInstance
  private baseUrl: string

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const site = credentials.extra?.['site'] as string | undefined

    if (!apiKey) {
      throw new Error(
        'OpenCartClient: credentials.accessToken (API key) is required',
      )
    }
    if (!site) {
      throw new Error(
        'OpenCartClient: credentials.extra.site is required (e.g. https://shop.example.com)',
      )
    }

    this.baseUrl = `${site.replace(/\/$/, '')}/index.php?route=rest`
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-Oc-Restadmin-Id': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(this.route(path), { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(this.route(path), body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(this.route(path), body)
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(this.route(path), { params })
    })
  }

  /**
   * List helper with offset-based pagination for OpenCart.
   * OpenCart uses `limit` and `page` (or `start`) query parameters.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ??
        (extraParams['per_page'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1
    const start = (page - 1) * limit

    const params: Record<string, unknown> = { ...extraParams }
    delete params['per_page']
    delete params['limit']
    params['start'] = start
    params['limit'] = limit

    const res = await this.get<{ data?: T[]; total?: number } | T[]>(path, params)

    // OpenCart may return { data: [...], total: N } or a plain array.
    let items: T[]
    let totalItems: number | undefined
    if (Array.isArray(res)) {
      items = res
    } else {
      items = (res.data ?? []) as T[]
      totalItems = res.total != null ? Number(res.total) : undefined
    }

    const hasMore = items.length === limit
    const nextPage = hasMore ? page + 1 : undefined

    return { items, nextPage, totalItems }
  }

  /**
   * Build the full route path. OpenCart REST endpoints are addressed as
   * `?route=rest/<resource>` — this helper appends the path segment.
   */
  private route(path: string): string {
    // The baseURL already ends with `?route=rest`; axios appends the
    // path. For GET/POST/PUT/DELETE the final URL becomes
    // `{site}/index.php?route=rest/{path}`.
    return `/${path}`
  }
}
