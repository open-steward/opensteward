/**
 * BreezeDoc REST API client.
 *
 * Personal-Access-Token Bearer auth + JSON. List endpoints return a
 * Laravel-style paginator (`{ current_page, data, last_page, total, ... }`)
 * and accept `order_by` / `direction` query params plus a `page` cursor.
 *
 * BreezeDoc rate-limits at 60 requests/minute and returns 429 on excess;
 * `withRetry` backs off on 429 and 5xx.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

export class BreezedocClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
}
