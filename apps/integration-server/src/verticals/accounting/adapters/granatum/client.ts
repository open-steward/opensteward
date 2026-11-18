/**
 * Granatum HTTP client.
 *
 * Auth: API key passed as `access_token` query parameter on every request.
 * The User-Agent header is required by the Granatum API.
 */
import axios, { type AxiosInstance } from 'axios'
import { GRANATUM_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class GranatumClient {
  private http: AxiosInstance
  private accessToken: string

  constructor(credentials: Credentials) {
    this.accessToken = credentials.accessToken
    this.http = axios.create({
      baseURL: `${GRANATUM_API_BASE}/`,
      headers: {
        'User-Agent': 'OpenSteward/1.0',
        Accept: 'application/json',
      },
    })
  }

  /** Merge the access_token into every request's query params */
  private auth(params?: Record<string, unknown>): Record<string, unknown> {
    return { access_token: this.accessToken, ...params }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.auth(params) })
      return data
    })
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      // Granatum expects form-encoded bodies for POST/PUT
      const searchParams = new URLSearchParams()
      searchParams.set('access_token', this.accessToken)
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) {
          searchParams.set(k, String(v))
        }
      }
      const { data } = await this.http.post<T>(path, searchParams, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }

  async put<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const searchParams = new URLSearchParams()
      searchParams.set('access_token', this.accessToken)
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) {
          searchParams.set(k, String(v))
        }
      }
      const { data } = await this.http.put<T>(path, searchParams, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params: this.auth() })
    })
  }
}
