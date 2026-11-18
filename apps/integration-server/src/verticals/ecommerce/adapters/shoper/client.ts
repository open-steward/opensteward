/**
 * Shoper REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {token}` auth header on every request.
 *  - Exponential backoff retry on 429 and 5xx.
 *  - `listWithPage` helper that reads Shoper's page-based pagination envelope:
 *      { count, page, pages, list: [...] }
 *    and returns the next page number so callers can iterate deterministically.
 *
 * Docs: https://developers.shoper.pl/developers/api/getting-started
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

/**
 * Shoper list response envelope.
 * All list endpoints wrap items in `{ count, page, pages, list: [...] }`.
 */
export interface ShoperListEnvelope<T> {
  count: number
  page: number
  pages: number
  list: T[]
}

export interface ListResult<T> {
  items: T[]
  /** Next page number, or undefined when on the last page. */
  nextPage?: number
  totalItems?: number
  totalPages?: number
}

export class ShoperClient {
  private http: AxiosInstance
  readonly storeUrl: string

  constructor(credentials: Credentials) {
    const storeUrl = credentials.extra?.['storeUrl'] as string | undefined
    if (!storeUrl) {
      throw new Error(
        'ShoperClient: credentials.extra.storeUrl is required. ' +
          'Pass the store base URL (e.g. https://mystore.shoparena.pl) when creating the connection.',
      )
    }
    this.storeUrl = storeUrl.replace(/\/$/, '')
    this.http = axios.create({
      baseURL: `${this.storeUrl}/${API_PATH}`,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper that follows Shoper's page-based pagination.
   *
   * Shoper list endpoints accept `page` (1-indexed) and `limit` query params
   * and return `{ count, page, pages, list: [...] }`.  Pass `extraParams.page`
   * to request a specific page.
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
    // Remove 'limit' synonym so we don't send both.
    delete params['limit']
    params['limit'] = limit

    const res = await this.get<ShoperListEnvelope<T>>(path, params)
    const nextPage = res.page < res.pages ? res.page + 1 : undefined

    return {
      items: res.list ?? [],
      nextPage,
      totalItems: res.count,
      totalPages: res.pages,
    }
  }
}
