/**
 * Optimizely Configured Commerce Storefront REST API (v1) client.
 *
 * `Authorization: Bearer` on every request. Pagination on list endpoints
 * uses `page` / `pageSize` query parameters (confirmed on
 * `/api/v1/products`, `/api/v1/accounts`, `/api/v1/orders`,
 * `/api/v1/categories`, `/api/v1/warehouses`).
 *
 * Docs: https://docs.developers.optimizely.com/configured-commerce/reference/getting-started-with-the-b2b-commerce-rest-apis
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'

export class OptimizelyClient {
  private http: AxiosInstance
  readonly instance: string

  constructor(credentials: Credentials) {
    const instance = credentials.extra?.['instance'] as string | undefined
    if (!instance) {
      throw new Error(
        'OptimizelyClient: credentials.extra.instance is required — re-create the connection via the Connect Link form.',
      )
    }
    if (!credentials.accessToken) {
      throw new Error('OptimizelyClient: credentials.accessToken is required')
    }
    this.instance = instance
    this.http = axios.create({
      baseURL: instance,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }
}
