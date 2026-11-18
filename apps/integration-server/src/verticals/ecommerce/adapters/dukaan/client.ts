/**
 * Dukaan Public API client.
 *
 *  - Host `https://api.mydukaan.io`, the only host the collection uses.
 *  - `authorization: Bearer <store token>`: the collection's "Important Keys"
 *    table reads "authorization | Bearer {store_authentication_token}".
 *  - 429/5xx retry with exponential backoff via `withRetry` from shared.
 *
 * Docs: https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { BASE_URL } from './constants'

/**
 * The paginated envelope of the category, coupon and audience lists, e.g.
 * get_category_list: `{ "count": 85, "next": "https://api.mydukaan.io/api/
 * product/seller/product-category/?page=2&page_size=30&v2=true",
 * "previous": null, "results": [...] }`.
 */
export interface DukaanPagedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/**
 * The envelope of the seller-front product and order lists, e.g.
 * product_list: `{ "status_code": 200, "count": 255, "results": [...] }`
 * (no `next`/`previous`).
 */
export interface DukaanCountedResponse<T> {
  status_code: number
  count: number
  results: T[]
}

/** The envelope of a detail read: `{ "status_code", "status", "detail", "data" }`. */
export interface DukaanDataResponse<T> {
  status_code: number
  status: string
  detail: string
  data: T
}

export class DukaanClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    if (!token) {
      throw new Error(
        'DukaanClient: credentials.accessToken (store authentication token) is required. ' +
          'Generate it in the Dukaan dashboard under Settings → Developer settings.',
      )
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
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
}
