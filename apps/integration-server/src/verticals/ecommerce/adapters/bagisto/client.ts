/**
 * Bagisto REST API client.
 *
 * Features:
 *  - Bearer auth header built from the stored access token.
 *  - Base URL read from `credentials.extra.baseUrl` (required).
 *  - Retries with exponential backoff on 429 and 5xx responses.
 *  - `listWithPage` helper for Bagisto's page-based pagination which
 *    returns `{ data: [...], links: { next, prev }, meta: { current_page, last_page, total } }`.
 *
 * Bagisto API prefix: `/api/v1`
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

export interface BagistoListMeta {
  current_page?: number
  last_page?: number
  total?: number
  per_page?: number
}

export interface BagistoListLinks {
  first?: string | null
  last?: string | null
  prev?: string | null
  next?: string | null
}

export interface BagistoListResponse<T> {
  data: T[]
  links?: BagistoListLinks
  meta?: BagistoListMeta
}

export interface BagistoSingleResponse<T> {
  data: T
}

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

export class BagistoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const accessToken = credentials.accessToken
    const baseUrl = (credentials.extra?.['baseUrl'] as string | undefined)?.replace(/\/$/, '')

    if (!accessToken) {
      throw new Error('BagistoClient: credentials.accessToken (Bearer token) is required')
    }
    if (!baseUrl) {
      throw new Error(
        'BagistoClient: credentials.extra.baseUrl is required ' +
          '(e.g. https://mystore.example.com)',
      )
    }

    this.http = axios.create({
      baseURL: `${baseUrl}${API_PREFIX}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

  async getSingle<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<BagistoSingleResponse<T>>(path, { params })
      return (data as BagistoSingleResponse<T>).data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<BagistoSingleResponse<T>>(path, body)
      return (data as BagistoSingleResponse<T>).data ?? (data as T)
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<BagistoSingleResponse<T>>(path, body)
      return (data as BagistoSingleResponse<T>).data ?? (data as T)
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper for Bagisto's paginated list endpoints.
   *
   * Bagisto uses a Laravel-style paginator:
   * ```json
   * {
   *   "data": [...],
   *   "links": { "first": "...", "last": "...", "prev": null, "next": "?page=2" },
   *   "meta": { "current_page": 1, "last_page": 3, "total": 42, "per_page": 15 }
   * }
   * ```
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

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['limit'] = limit
    params['page'] = page

    const response = await withRetry(async () => {
      const { data } = await this.http.get<BagistoListResponse<T>>(path, { params })
      return data
    })

    const meta = response.meta
    const nextPage =
      meta && meta.current_page != null && meta.last_page != null
        ? meta.current_page < meta.last_page
          ? meta.current_page + 1
          : undefined
        : undefined

    return {
      items: response.data ?? [],
      nextPage,
      totalPages: meta?.last_page,
      totalItems: meta?.total,
    }
  }
}
