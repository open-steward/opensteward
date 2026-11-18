/**
 * Shopify Admin REST API client, copied from the Shopify adapter. Only the
 * methods the GoDaddy rebuild did not touch (writes, inventory, fulfillments,
 * refunds, transactions) still use it; the documented GoDaddy reads use
 * `commerce-client.ts`.
 *
 * Features:
 *  - `X-Shopify-Access-Token` auth header (NOT `Authorization: Bearer`).
 *  - Simple 429 retry with exponential backoff.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION } from './constants'
import { withRetry } from '@opensteward/shared'

export class ShopifyClient {
  private http: AxiosInstance
  private shopHost: string

  constructor(credentials: Credentials, shop: string) {
    this.shopHost = shop.endsWith('.myshopify.com') ? shop : `${shop}.myshopify.com`
    this.http = axios.create({
      baseURL: `https://${this.shopHost}/admin/api/${API_VERSION}`,
      headers: {
        'X-Shopify-Access-Token': credentials.accessToken,
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
}
