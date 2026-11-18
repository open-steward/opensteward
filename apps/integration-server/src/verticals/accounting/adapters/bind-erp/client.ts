/**
 * Bind ERP HTTP client.
 *
 * Auth: API key forwarded in the `apiKey` request header (no prefix).
 * Base URL: http://api.bind.com.mx  (v1.2 API)
 *
 * Pagination: OData-style – `$top` and `$skip` query parameters.
 * Paginated list responses have the shape:
 *   { value: T[], nextLink?: string, count: number }
 */

import axios, { type AxiosInstance } from 'axios'
import { BIND_ERP_API_BASE, BIND_ERP_AUTH_HEADER } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** OData-style list envelope returned by every collection endpoint. */
export interface BindListResponse<T> {
  value: T[]
  nextLink?: string
  count?: number
}

export class BindErpClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${BIND_ERP_API_BASE}/`,
      headers: {
        [BIND_ERP_AUTH_HEADER]: credentials.accessToken,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
