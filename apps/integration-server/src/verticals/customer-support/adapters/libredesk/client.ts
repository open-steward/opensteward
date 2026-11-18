/**
 * Libredesk HTTP client.
 *
 * Base URL is per-instance (self-hosted), stored in credentials.extra.baseUrl.
 * Auth: Basic Authorization using base64(apiKey:apiSecret).
 *
 * Pagination uses ?page=<n>&page_size=<n>. Responses are wrapped in a data
 * envelope; list endpoints return PageResults { results, total, per_page,
 * total_pages, page }.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH_PREFIX } from './constants'

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

export class LibredeskClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = (credentials.extra?.['baseUrl'] as string | undefined ?? '').replace(/\/$/, '')
    const accessToken = credentials.accessToken
    this.http = axios.create({
      baseURL: `${baseUrl}${API_PATH_PREFIX}`,
      headers: {
        Authorization: `Basic ${accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<{ data: T }>(path, { params })
      // Libredesk wraps responses in { data: ... }
      return (data as unknown as { data?: T }).data ?? (data as unknown as T)
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<{ data: T }>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return (data as unknown as { data?: T }).data ?? (data as unknown as T)
    })
  }
}
