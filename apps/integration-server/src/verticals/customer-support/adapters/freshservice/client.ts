/**
 * Freshservice HTTP client.
 *
 * Auth: HTTP Basic — the credentials.accessToken is already the base64-encoded
 * "apiKey:X" string produced by exchangeCredentials(), so we send it directly
 * as `Authorization: Basic <token>`.
 *
 * Pagination: ?per_page=N&page=N  (max 100 per page, page starts at 1).
 * Rate-limit headers: X-RateLimit-Total / X-RateLimit-Remaining.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

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

export class FreshserviceClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const subdomain = String(credentials.extra?.['subdomain'] ?? '')
    if (!subdomain) {
      throw new Error('freshservice requires credentials.extra.subdomain')
    }
    const baseURL = API_BASE_URL_TEMPLATE.replace('{subdomain}', subdomain)
    this.http = axios.create({
      baseURL,
      headers: {
        // credentials.accessToken is base64("apiKey:X") set by exchangeCredentials
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
