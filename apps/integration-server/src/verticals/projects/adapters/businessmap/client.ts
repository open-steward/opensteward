/**
 * Businessmap API v2 HTTP client.
 *
 * Auth: `apikey` request header (static API token).
 * Base URL is per-account: https://{subdomain}.kanbanize.com/api/v2
 * Pagination: page / per_page query params; responses wrap payload in
 *   { data: { data: [...], pagination: { ... } } }  (list)
 *   { data: { ... } }                                (single)
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

export class BusinessmapClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const subdomain = String((credentials.extra as Record<string, unknown>)?.['subdomain'] ?? '')
    if (!subdomain) throw new Error('businessmap: credentials.extra.subdomain is required')

    this.http = axios.create({
      baseURL: buildBaseUrl(subdomain),
      headers: {
        apikey: credentials.accessToken,
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
