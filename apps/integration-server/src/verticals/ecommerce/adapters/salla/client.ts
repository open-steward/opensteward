/**
 * Salla Merchant API HTTP client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` header.
 *  - Retry on 429 via the shared `withRetry` helper.
 *  - `listPages` helper that follows Salla's page-based pagination.
 *    Salla list responses include:
 *      { status, success, data: [...], pagination: { count, current, next } }
 *    where `pagination.next` is a URL for the next page (null when done).
 *
 * Docs: https://docs.salla.dev/
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SALLA_API_BASE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

/** Salla's standard list-response envelope. */
export interface SallaListResponse<T> {
  status: number
  success: boolean
  data: T[]
  pagination?: {
    count?: number
    current?: number
    /** URL of the next page, or null/absent when on the last page. */
    next?: string | null
    total?: number
    perPage?: number
    currentPage?: number
    totalPages?: number
  }
}

/** Salla's standard single-resource envelope. */
export interface SallaResponse<T> {
  status: number
  success: boolean
  data: T
}

export interface ListResult<T> {
  items: T[]
  /** Numeric page number for the next page (undefined = no more pages). */
  nextPage?: number
}

export class SallaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SALLA_API_BASE,
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
   * List helper that handles Salla's page-based pagination.
   *
   * @param path     API path relative to SALLA_API_BASE (e.g. `/products`)
   * @param params   Additional query params (page, per_page, filters, etc.)
   */
  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      typeof params.per_page === 'number' ? params.per_page : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const res = await this.get<SallaListResponse<T>>(path, { per_page: perPage, ...params })

    const items = Array.isArray(res.data) ? res.data : []
    const pag = res.pagination

    // Determine if there is a next page
    let nextPage: number | undefined
    if (pag) {
      if (pag.next) {
        // `next` is a URL like https://api.salla.dev/admin/v2/products?page=2
        try {
          const url = new URL(pag.next)
          const p = url.searchParams.get('page')
          if (p) nextPage = parseInt(p, 10)
        } catch {
          // If parsing fails, try incrementing current page
          const current = pag.current ?? pag.currentPage ?? 1
          nextPage = current + 1
        }
      } else {
        // Some endpoints use totalPages/currentPage
        const total = pag.totalPages
        const current = pag.currentPage ?? pag.current ?? 1
        if (total && current < total) {
          nextPage = current + 1
        }
      }
    }

    return { items, nextPage }
  }
}
