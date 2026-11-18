/**
 * BetterCommerce Commerce API HTTP client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` header injected on every request.
 *  - Automatic token refresh on 401 using stored clientId/clientSecret.
 *  - Page-number pagination via `currentPage` / `pageSize` query params.
 *  - 429 / 5xx retry with exponential backoff via `withRetry`.
 *
 * The BetterCommerce API wraps list results in:
 *   { result: { results: T[], total: number, pages: number, currentPage: number } }
 * and single-resource results in { result: T }.
 *
 * Base URL: https://api20.bettercommerce.io/api/v2/
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { BASE_URL, API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { obtainToken } from './auth'

export interface ListResult<T> {
  items: T[]
  /** Next page number, or undefined when on the last page. */
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

/** Envelope returned by BetterCommerce list endpoints. */
interface ListEnvelope<T> {
  result?: {
    results?: T[]
    total?: number
    pages?: number
    currentPage?: number
    pageSize?: number
  }
  status?: number
  message?: string
}

/** Envelope returned by BetterCommerce single-resource endpoints. */
interface SingleEnvelope<T> {
  result?: T
  status?: number
  message?: string
}

export class BetterCommerceClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: `${BASE_URL}/api/${API_VERSION}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Re-acquire a token and update the Authorization header in-place. */
  private async refreshToken(): Promise<void> {
    const clientId = this.credentials.extra?.['clientId'] as string | undefined
    const clientSecret = this.credentials.extra?.['clientSecret'] as string | undefined
    if (!clientId || !clientSecret) {
      throw new Error(
        'BetterCommerceClient: cannot refresh token — clientId/clientSecret not stored in credentials.extra',
      )
    }
    const fresh = await obtainToken(clientId, clientSecret)
    this.credentials = fresh
    this.http.defaults.headers.common['Authorization'] = `Bearer ${fresh.accessToken}`
  }

  /** GET with automatic 401-retry-after-refresh and 429/5xx backoff. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.get<T>(path, { params })
        return data
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 401) {
          await this.refreshToken()
          const { data } = await this.http.get<T>(path, { params })
          return data
        }
        throw err
      }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.post<T>(path, body)
        return data
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 401) {
          await this.refreshToken()
          const { data } = await this.http.post<T>(path, body)
          return data
        }
        throw err
      }
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.put<T>(path, body)
        return data
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 401) {
          await this.refreshToken()
          const { data } = await this.http.put<T>(path, body)
          return data
        }
        throw err
      }
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      try {
        await this.http.delete(path, { params })
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 401) {
          await this.refreshToken()
          await this.http.delete(path, { params })
          return
        }
        throw err
      }
    })
  }

  /**
   * Fetch one page of a list resource.
   *
   * BetterCommerce wraps list results in:
   *   { result: { results: T[], total: number, pages: number, currentPage: number } }
   */
  async listPage<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (params['pageSize'] as number | undefined) ??
        (params['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const currentPage = (params['currentPage'] as number | undefined) ?? 1

    const merged: Record<string, unknown> = { ...params, pageSize, currentPage }
    delete merged['limit']

    const envelope = await this.get<ListEnvelope<T>>(path, merged)
    const r = envelope.result
    const items = r?.results ?? []
    const totalPages = r?.pages
    const nextPage =
      totalPages != null && currentPage < totalPages ? currentPage + 1 : undefined

    return {
      items,
      nextPage,
      totalPages,
      totalItems: r?.total,
    }
  }

  /**
   * Unwrap a single-resource envelope `{ result: T }`.
   */
  async getSingle<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const envelope = await this.get<SingleEnvelope<T>>(path, params)
    if (!envelope.result) {
      throw new Error(`BetterCommerce: empty result for GET ${path}`)
    }
    return envelope.result
  }

  /**
   * POST and unwrap a single-resource result envelope.
   */
  async postSingle<T>(path: string, body?: unknown): Promise<T> {
    const envelope = await this.post<SingleEnvelope<T>>(path, body)
    if (!envelope.result) {
      throw new Error(`BetterCommerce: empty result for POST ${path}`)
    }
    return envelope.result
  }

  /**
   * PUT and unwrap a single-resource result envelope.
   */
  async putSingle<T>(path: string, body?: unknown): Promise<T> {
    const envelope = await this.put<SingleEnvelope<T>>(path, body)
    if (!envelope.result) {
      throw new Error(`BetterCommerce: empty result for PUT ${path}`)
    }
    return envelope.result
  }
}
