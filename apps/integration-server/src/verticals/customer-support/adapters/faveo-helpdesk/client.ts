/**
 * Faveo Helpdesk HTTP client (v3).
 *
 * Auth: JWT token passed as `Authorization: Bearer <token>` header on every request.
 * Optional api_key may be sent as a query parameter when present in credentials.extra.
 *
 * Base URL is per-tenant and stored in credentials.extra.baseUrl. The client is
 * rooted at the tenant URL and every call names its full path: most v3 routes
 * sit under /v3/api (API_V3_PATH), but the documented user list is
 * /v3/user-export-data (USER_EXPORT_PATH), outside that prefix.
 * Pagination: `page` + `limit` query params; responses carry current_page /
 * last_page / total inside { success, message, data }.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEMO_BASE_URL } from './constants'

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

export class FaveoHelpdeskClient {
  private http: AxiosInstance
  private apiKey: string | undefined
  /** The tenant URL every path is appended to. */
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const baseUrl = (
      (credentials.extra?.['baseUrl'] as string | undefined) ?? DEMO_BASE_URL
    ).replace(/\/$/, '')

    this.baseUrl = baseUrl
    this.apiKey = credentials.extra?.['apiKey'] as string | undefined

    // v3 requires token as Authorization: Bearer <token> header
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
      },
      timeout: 30_000,
    })
  }

  /** Optional api_key query params (only when configured by admin) */
  private apiKeyParams(): Record<string, string> {
    const p: Record<string, string> = {}
    if (this.apiKey) p['api_key'] = this.apiKey
    return p
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { ...this.apiKeyParams(), ...(params ?? {}) },
      })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.apiKeyParams(),
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
