/**
 * LEDGERS.Cloud HTTP client.
 *
 * Auth: every request carries two headers:
 *   x-api-key  — static developer API key (from credentials.extra.apiKey)
 *   api-token  — session token (credentials.accessToken, valid 24 hours)
 *
 * Base URL:  https://in-api.ledgers.cloud/v3
 * Sandbox:   https://in-api-uat.ledgers.cloud/v3
 *
 * Pagination: query params page_number (1-based) and page_size.
 */

import axios, { type AxiosInstance } from 'axios'
import { LEDGERS_API_BASE, DEFAULT_PAGE_SIZE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface LedgersPageParams {
  page_number?: number
  page_size?: number
  [key: string]: unknown
}

export class LedgersClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = (credentials.extra?.['apiKey'] as string | undefined) ?? ''
    if (!apiKey) {
      throw new Error(
        'LEDGERS.Cloud adapter: missing API key. Re-authenticate to supply your Developer API Key.',
      )
    }
    this.http = axios.create({
      baseURL: `${LEDGERS_API_BASE}/`,
      headers: {
        'x-api-key': apiKey,
        'api-token': credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async getList<T>(
    path: string,
    page: number,
    limit: number,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    const pageSize = Math.min(limit, 200)
    return this.get<T>(path, {
      page_number: page,
      page_size: pageSize,
      ...extra,
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }
}

export { DEFAULT_PAGE_SIZE }
