/**
 * Aha! REST API HTTP client.
 *
 * Base URL: `https://<account>.aha.io/api/v1` (captured at auth time on
 * `credentials.extra.apiBaseUrl`; falls back to the shared `secure.aha.io`
 * host). Auth: `Authorization: Bearer <access_token>`.
 *
 * Pagination is page-number based via `page` / `per_page` query params. List
 * responses wrap the records under a resource-named key alongside a
 * `pagination` array, e.g.
 *   { "pagination": [{ "total_records", "total_pages", "current_page" }],
 *     "features": [ … ] }
 *
 * Rate limit: 300 req/min (20 req/s). 429 + 5xx are retried with backoff.
 *
 * Docs: https://www.aha.io/api
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_API_BASE_URL } from './constants'

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

function resolveBaseUrl(credentials: Credentials): string {
  const fromExtra = credentials.extra?.['apiBaseUrl']
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra
  return DEFAULT_API_BASE_URL
}

export class AhaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: resolveBaseUrl(credentials),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
}
