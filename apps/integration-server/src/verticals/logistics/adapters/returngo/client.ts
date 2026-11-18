import axios, { type AxiosInstance } from 'axios'
import { RETURNGO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the ReturnGO REST API.
 *
 * Auth headers:
 *   x-api-key   — API key stored in credentials.accessToken
 *   x-shop-name — Shop identifier stored in credentials.refreshToken
 *                 (optional; only needed for multi-portal shops)
 */
export class ReturnGoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const headers: Record<string, string> = {
      'x-api-key': credentials.accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (credentials.refreshToken) {
      headers['x-shop-name'] = credentials.refreshToken
    }

    this.http = axios.create({
      baseURL: RETURNGO_API_BASE,
      headers,
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
}
