/**
 * FastSpring REST API client.
 *
 * Docs: https://developer.fastspring.com/reference/api-overview
 *
 * Features:
 *  - HTTP Basic auth built from the merchant's API username/password
 *    (axios's `auth` option base64-encodes and sets the header).
 *  - Mandatory `User-Agent` header on every call (FastSpring rejects
 *    requests without one).
 *  - `withRetry` from `@opensteward/shared` for 429 back-off — FastSpring
 *    limits to 250 calls/IP/minute.
 *  - `listIds` — the shape shared by the `GET /products`, `/orders`,
 *    `/accounts` and `/coupons` list endpoints: a JSON envelope holding an
 *    array of path/id STRINGS (not full objects) under a resource-named
 *    key, plus (for products/orders/accounts, but not coupons) `page`,
 *    `limit`, `nextPage`, `total`. There is no documented bulk-fetch-by-id;
 *    the adapter GETs each id individually (see e.g.
 *    https://developer.fastspring.com/reference/retrieve-a-product, whose
 *    `product_path` path parameter takes exactly one id).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, USER_AGENT } from './constants'

export interface IdListResult {
  ids: string[]
  page?: number
  limit?: number
  nextPage?: number
  total?: number
}

export class FastSpringClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const username =
      (credentials.extra?.['apiUsername'] as string | undefined) ?? credentials.accessToken
    const password = credentials.extra?.['apiPassword'] as string | undefined
    if (!username) {
      throw new Error('FastSpringClient: credentials.accessToken (apiUsername) is required')
    }
    if (!password) {
      throw new Error('FastSpringClient: credentials.extra.apiPassword is required')
    }

    this.http = axios.create({
      baseURL: API_BASE_URL,
      auth: { username, password },
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.get<T>(path, { params })
        return data
      } catch (err) {
        throw normalizeError(err)
      }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.post<T>(path, body)
        return data
      } catch (err) {
        throw normalizeError(err)
      }
    })
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.delete<T>(path)
        return data
      } catch (err) {
        throw normalizeError(err)
      }
    })
  }

  /**
   * `GET <path>` against a list endpoint returning `{ [idsKey]: string[],
   * page?, limit?, nextPage?, total? }`. `idsKey` is `'products'`,
   * `'orders'`, `'accounts'`, or `'coupons'`.
   */
  async listIds(
    path: string,
    idsKey: string,
    params: Record<string, unknown>,
  ): Promise<IdListResult> {
    const data = await this.get<Record<string, unknown>>(path, params)
    const ids = Array.isArray(data[idsKey]) ? (data[idsKey] as string[]) : []
    return {
      ids,
      page: typeof data['page'] === 'number' ? (data['page'] as number) : undefined,
      limit: typeof data['limit'] === 'number' ? (data['limit'] as number) : undefined,
      nextPage: typeof data['nextPage'] === 'number' ? (data['nextPage'] as number) : undefined,
      total: typeof data['total'] === 'number' ? (data['total'] as number) : undefined,
    }
  }
}

/** Preserve the HTTP status on the thrown error so `withRetry` can see it. */
function normalizeError(err: unknown): Error {
  const axiosErr = err as AxiosError
  if (axiosErr?.isAxiosError) {
    const status = axiosErr.response?.status
    const message = `FastSpring API error${status ? ` (${status})` : ''}: ${axiosErr.message}`
    const wrapped = new Error(message) as Error & { response?: { status?: number } }
    wrapped.response = { status }
    return wrapped
  }
  return err instanceof Error ? err : new Error(String(err))
}
