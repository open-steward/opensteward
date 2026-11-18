/**
 * UseDesk API HTTP client.
 *
 * UseDesk's REST API uses POST for all list/read operations, with `api_token`
 * injected into every request body (not a header). The base URL defaults to
 * the cloud endpoint but can be overridden via credentials.extra.baseUrl for
 * self-hosted instances.
 *
 * Rate limits: 10 req/min for search-query-based requests; other endpoints
 * have no documented limit. We apply exponential back-off on 429 and 5xx.
 *
 * Docs: https://api.usedocs.com/
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
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class UsedeskClient {
  private http: AxiosInstance
  private apiToken: string

  constructor(credentials: Credentials) {
    this.apiToken = credentials.accessToken
    const baseURL = String(credentials.extra?.['baseUrl'] || '') || API_BASE_URL
    this.http = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST request — UseDesk uses POST for all read/list operations.
   * The api_token is always merged into the request body.
   */
  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, {
        ...body,
        api_token: this.apiToken,
      })
      return data
    })
  }
}
