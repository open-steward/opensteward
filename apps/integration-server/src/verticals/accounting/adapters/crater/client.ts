/**
 * Crater HTTP client.
 *
 * Base URL: <instance_url>/api/v1/ — stored in credentials.extra.baseUrl.
 * Auth header: Authorization: Bearer <access_token>
 * Business header: business: <business_id> — stored in credentials.tenantId.
 *
 * All list responses are paginated Laravel-style:
 *   { data: T[], meta: { current_page, last_page, per_page, total, ... } }
 */
import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'
import { BUSINESS_HEADER } from './constants'

export class CraterClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = (credentials.extra?.['baseUrl'] as string | undefined) ?? ''
    const origin = baseUrl.replace(/\/+$/, '')
    const apiBase = `${origin}/api/v1/`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (credentials.tenantId) {
      headers[BUSINESS_HEADER] = credentials.tenantId
    }

    this.http = axios.create({ baseURL: apiBase, headers })
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
