/**
 * Zenvia Customer Cloud HTTP client.
 *
 * Authentication: the API key is appended as the `api-key` query parameter on
 * every request.  The base URL is https://sales.zenvia.com/api/v1.
 *
 * Rate limit: 200 RPM per key (resets every 60 s).  On 429 or 5xx the client
 * retries with exponential back-off (up to 4 retries).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ZenviaClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * Merge the `api-key` query parameter into every outgoing request.
   */
  private authParams(extra?: Record<string, unknown>): Record<string, unknown> {
    return { 'api-key': this.apiKey, ...extra }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: this.authParams(params),
      })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.authParams(),
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
