/**
 * Toast API client.
 *
 * Features:
 *  - Bearer token + Toast-Restaurant-External-ID header on every request.
 *  - `tokenPage` for the Configuration API's pageToken chain, and
 *    `getWithHeaders` for endpoints that page by response headers.
 *  - 429/5xx retry with exponential backoff.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { toastHost } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status != null && status >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ToastClient {
  private http: AxiosInstance
  readonly restaurantId: string

  constructor(credentials: Credentials) {
    const baseURL = toastHost(credentials.extra?.['environment'])
    this.restaurantId = (credentials.extra?.['restaurantId'] as string) ?? ''
    if (!this.restaurantId) {
      throw new Error('Toast adapter requires restaurantId in credentials.extra')
    }
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Toast-Restaurant-External-ID': this.restaurantId,
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

  /** GET that also returns the response headers (lower-cased by axios). */
  async getWithHeaders<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<{ data: T; headers: Record<string, unknown> }> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      return { data: res.data, headers: (res.headers ?? {}) as Record<string, unknown> }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
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
   * One page of a pageToken-paginated endpoint (the Configuration API).
   *
   * Sends ONLY `pageToken` (absent on the first page): pageSize and page "are
   * deprecated and are removed from the configuration API endpoints". The next
   * page's token is the `Toast-Next-Page-Token` response header; "If the
   * response does not include a Toast-Next-Page-Token field, ... there is no
   * next page to return."
   * https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html
   *
   * `filters` carries the endpoint's other documented query parameters (the
   * Configuration API's `lastModified`), sent on every page of the chain.
   */
  async tokenPage<T>(
    path: string,
    pageToken: string | undefined,
    filters: Record<string, string> = {},
  ): Promise<{ items: T[]; next: string | undefined }> {
    return withRetry(async () => {
      const params = pageToken === undefined ? { ...filters } : { ...filters, pageToken }
      const res = await this.http.get<T[]>(path, { params })
      const headers = (res.headers ?? {}) as Record<string, unknown>
      const raw = headers['toast-next-page-token'] ?? headers['Toast-Next-Page-Token']
      const next = typeof raw === 'string' && raw !== '' ? raw : undefined
      return { items: Array.isArray(res.data) ? res.data : [], next }
    })
  }
}
