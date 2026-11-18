/**
 * Helpjuice HTTP client.
 *
 * Authentication: Authorization header with the raw API key (no Bearer prefix).
 * Rate limit: 100 requests/minute — exponential backoff on 429 and 5xx.
 * Base URL: per-tenant https://<account>.helpjuice.com/api/v3
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class HelpjuiceClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const account = String(credentials.extra?.['account'] ?? '')
    if (!account) throw new Error('helpjuice: missing account subdomain in credentials.extra')
    const baseURL = buildBaseUrl(account)
    this.http = axios.create({
      baseURL,
      headers: {
        // Helpjuice accepts the API key as a raw Authorization header value
        Authorization: credentials.accessToken,
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
