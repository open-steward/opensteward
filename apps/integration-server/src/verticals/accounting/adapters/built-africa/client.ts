import axios, { type AxiosInstance } from 'axios'
import { BUILT_AFRICA_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * HTTP client for the Built Accounting REST API.
 *
 * Auth: Authorization: Bearer <access_token>  (business-scoped API key)
 * Base: https://web.built.africa/api/v3/
 * Pagination: ?page=<n>  — response envelope: { current_page, data[], last_page, total, per_page }
 */
export class BuiltAfricaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: BUILT_AFRICA_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}

/** Standard paginated envelope returned by Built list endpoints */
export interface BuiltPage<T> {
  current_page: number
  data: T[]
  last_page: number
  total: number
  per_page: number
  next_page_url: string | null
  prev_page_url: string | null
}
