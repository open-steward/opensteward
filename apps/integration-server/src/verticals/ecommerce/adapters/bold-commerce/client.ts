/**
 * Bold Commerce API client.
 *
 * "You can make most API calls using the following cURL request format:
 *   curl --request {METHOD} 'https://api.boldcommerce.com/{api}/{version}/shops/{shop_identifier}/{resource}'
 *   --header 'Authorization: Bearer {access_token}'"
 * https://developer.boldcommerce.com/guides/checkout/public-integrations
 *
 * 429s are retried by the shared `withRetry`: "If you experience a rate limit
 * error, the best course of action is to wait one second and retry the
 * request." (https://developer.boldcommerce.com/guides/checkout/resources/rate-limiting)
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION_DATE } from './constants'

/**
 * The `pagination` block Bold list endpoints return: "Endpoints that can
 * return multiple resources will return pagination elements with the
 * following attributes: total, count, per_page, current_page, total_pages,
 * next_url, previous_url."
 */
export interface BoldPagination {
  total?: number
  count?: number
  per_page?: number
  current_page?: number
  total_pages?: number
  next_url?: string
  previous_url?: string
}

export class BoldCommerceClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Bold-API-Version-Date': API_VERSION_DATE,
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
