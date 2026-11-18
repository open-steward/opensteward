/**
 * Starweb Shop API v2 HTTP client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` header from credentials.accessToken.
 *  - Simple 429/5xx retry with exponential back-off.
 *  - `listWithPage` helper that reads Starweb's page-based pagination:
 *      response envelope: { data: T[], meta: { pagination: { total, count, per_page, current_page, total_pages } } }
 *      query params: ?page=N (1-indexed)
 *  - All single-resource responses wrapped in `{ data: T }` envelope.
 *
 * Docs: https://api-docs.starweb.se/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, shopBaseUrl } from './constants'

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

export interface StarwebPagination {
  total?: number
  count?: number
  per_page?: number
  current_page?: number
  total_pages?: number
}

export interface StarwebMeta {
  pagination?: StarwebPagination
}

/** Envelope shape for list responses. */
export interface StarwebListEnvelope<T> {
  data: T[]
  meta?: StarwebMeta
}

/** Envelope shape for single-resource responses. */
export interface StarwebItemEnvelope<T> {
  data: T
}

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

export class StarwebClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, shopId: string) {
    const baseURL = shopBaseUrl(shopId)
    this.http = axios.create({
      baseURL,
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
   * List helper for Starweb page-based pagination.
   * Envelope: `{ data: T[], meta: { pagination: { current_page, total_pages, total } } }`
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

    const res = await this.get<StarwebListEnvelope<T>>(path, params)
    const pagination = res.meta?.pagination
    const currentPage = pagination?.current_page ?? page
    const totalPages = pagination?.total_pages
    const nextPage =
      totalPages != null && currentPage < totalPages ? currentPage + 1 : undefined

    return {
      items: res.data ?? [],
      nextPage,
      totalPages,
      totalItems: pagination?.total,
    }
  }
}
