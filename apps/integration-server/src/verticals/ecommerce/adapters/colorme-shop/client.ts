/**
 * ColorMe Shop API client.
 *
 * `Authorization: Bearer <token>`, base `https://api.shop-pro.jp/v1`.
 * `withRetry` handles 429s. `list` follows the documented `limit` + `offset`
 * pagination (https://api.shop-pro.jp/v1/spec/open_api.json).
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  hasMore: boolean
}

export class ColormeShopClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE,
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
   * One page of a `limit` + `offset` list. `page` (1-based, the sync
   * worker's own convention) is converted to `offset` here — the only two
   * inputs ever supplied are `page` and `limit`.
   */
  async list<T>(
    path: string,
    resourceKey: string,
    params: { page?: number; limit?: number } = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const offset = (page - 1) * limit
    const data = await this.get<Record<string, T[]>>(path, { limit, offset })
    const items = data[resourceKey] ?? []
    return { items, hasMore: items.length >= limit }
  }
}
