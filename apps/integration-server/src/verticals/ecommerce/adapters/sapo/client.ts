/**
 * Sapo Admin REST API client.
 *
 * Features:
 *  - `X-Sapo-Access-Token` auth header for OAuth-based apps.
 *  - HTTP Basic auth (apiKey:apiSecret) for private apps when
 *    `credentials.extra.apiSecret` is present.
 *  - Simple 429 / 5xx retry with exponential backoff.
 *  - `listWithPage` helper that uses Sapo's page/limit pagination
 *    (`page` defaults to 1, max `limit` is 250).
 *
 * Base URL format: https://{store}.mysapo.net/admin
 *
 * Docs: https://support.sapo.vn/gioi-thieu-api
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { storeHost } from './auth'

export interface ListResult<T> {
  items: T[]
  /** Next page number, or undefined if this was the last page. */
  nextPage?: number
}

export class SapoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, store: string) {
    const host = storeHost(store)
    const baseURL = `https://${host}/admin`

    // Private-app mode: api_key + api_secret → HTTP Basic auth
    const apiSecret = credentials.extra?.['apiSecret'] as string | undefined
    let headers: Record<string, string>
    if (apiSecret) {
      const basic = Buffer.from(`${credentials.accessToken}:${apiSecret}`).toString('base64')
      headers = {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }
    } else {
      // OAuth app mode: bearer-style access token in custom header
      headers = {
        'X-Sapo-Access-Token': credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }
    }

    this.http = axios.create({ baseURL, headers, timeout: 30_000 })
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
   * Page-based list helper.
   *
   * Sapo wraps list responses in `{ [resourceKey]: [...] }`. Returns the
   * items array and the next page number when there are more results.
   * The caller signals "no more pages" when `nextPage` is undefined.
   */
  async listWithPage<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams, limit, page }
    delete params['limit'] // replaced above
    params['limit'] = limit

    const data = await this.get<Record<string, T[]>>(path, params)
    const items = (data[resourceKey] ?? []) as T[]

    // Sapo returns an empty array (or fewer items than `limit`) on the last page.
    const nextPage = items.length >= limit ? page + 1 : undefined
    return { items, nextPage }
  }
}
