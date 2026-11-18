/**
 * Dooca Commerce REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {token}` auth header.
 *  - 429 / 5xx retry with exponential backoff (via shared `withRetry`).
 *  - `listWithPage` helper that reads Dooca's page-based pagination metadata
 *    from the `meta` object in the response body and returns the next page
 *    number so callers can iterate.
 *
 * Dooca pagination response shape:
 *   {
 *     data: [...],
 *     links: { first, last, prev, next },
 *     meta: { current_page, last_page, per_page, total, from, to }
 *   }
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface DoocaListMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface DoocaListResponse<T> {
  data: T[]
  meta?: DoocaListMeta
  links?: {
    first?: string | null
    last?: string | null
    prev?: string | null
    next?: string | null
  }
}

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalItems?: number
}

export class DoocaCommerceClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
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
   * List helper that reads Dooca's page-based pagination from the `meta`
   * object embedded in the response body. `data` is the item array.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      (extraParams['per_page'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['per_page'] = perPage
    params['page'] = page

    const res = await this.get<DoocaListResponse<T>>(path, params)
    const meta = res.meta
    const currentPage = meta?.current_page ?? page
    const lastPage = meta?.last_page ?? 1

    return {
      items: res.data ?? [],
      nextPage: currentPage < lastPage ? currentPage + 1 : undefined,
      totalItems: meta?.total,
    }
  }
}
