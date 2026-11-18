/**
 * Centra Order API client.
 *
 * Features:
 *  - `API-Authorization` header auth — Centra's own header (not `Authorization: Bearer`).
 *  - Retries with exponential back-off on 429 and 5xx.
 *  - `listWithOffset` helper for one page of a list endpoint. Paging differs
 *    per endpoint (offset for orders/customers/shipments, page for returns,
 *    and a relative `next` such as "?limit=10&page=3" for products/stock);
 *    the caller sends the right parameter and reads `next` itself.
 *
 * Centra Order API base URL is instance-specific and is supplied by the
 * merchant via `credentials.extra.baseUrl`
 * (e.g. `https://myshop.centra.com/api/order-api`).
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_HEADER, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
  /**
   * The response's `next`, verbatim, when present. Centra documents it as a
   * relative query ("?limit=10&page=3", "Will contain a URL to the next
   * page.") on GET products and GET stock, absent on the last page.
   */
  next?: string
}

/**
 * Extract the base URL from credentials. Merchants supply the exact Order API
 * plugin URL (e.g. `https://myshop.centra.com/api/order-api`) in
 * `credentials.extra.baseUrl`. The field accepts either `baseUrl` (preferred)
 * or the legacy `site` alias.
 */
function resolveBaseUrl(credentials: Credentials): string {
  const url =
    (credentials.extra?.['baseUrl'] as string | undefined) ??
    (credentials.extra?.['site'] as string | undefined)
  if (!url) {
    throw new Error(
      'CentraClient: credentials.extra.baseUrl is required ' +
        '(copy the Order API plugin URL from the Centra backend).',
    )
  }
  return url.replace(/\/$/, '')
}

export class CentraClient {
  private http: AxiosInstance
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.baseUrl = resolveBaseUrl(credentials)
    const apiKey = credentials.accessToken
    if (!apiKey) {
      throw new Error('CentraClient: credentials.accessToken (API key) is required.')
    }

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        [AUTH_HEADER]: apiKey,
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
   * One page of a Centra list endpoint. `limit` is clamped to MAX_PAGE_SIZE;
   * a caller that strides by the size sent clamps it the same way first.
   *
   * @param path       Endpoint path relative to the baseURL (e.g. `products`).
   * @param extraParams Query parameters to merge (limit, offset, modified, …).
   */
  async listWithOffset<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const params: Record<string, unknown> = { ...extraParams, limit }

    const data = await this.get<Record<string, unknown>>(path, params)

    const items = (data[resourceKey] ?? []) as T[]

    const next = data['next']
    return typeof next === 'string' && next !== '' ? { items, next } : { items }
  }
}
