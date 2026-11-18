import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, USER_AGENT } from './constants'

/**
 * Thin HTTP client for the Float REST API.
 *
 * The access token rides in the standard `Authorization: Bearer {token}`
 * header. Float requires a descriptive `User-Agent` (app name + contact
 * email) on every request, so it is always sent.
 *
 * Collections come back as bare JSON arrays; large lists page with a 1-based
 * `?page=N` query parameter plus a `per-page` size (max 200).
 */
export class FloatClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
