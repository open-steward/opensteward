/**
 * Jitbit Helpdesk HTTP client.
 *
 * Auth header is derived from credentials.extra.authScheme:
 *   Bearer <token>  — when authScheme === 'Bearer'
 *   Basic  <b64>    — when authScheme === 'Basic'
 *
 * Base URL is stored in credentials.extra.baseUrl.
 * Pagination: offset (0-based) + count (page size).
 * Rate limit: 90 req/min general, 60 req/min for search/UserByEmail.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

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

export class JitbitHelpdeskClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? '').replace(/\/$/, '')
    if (!baseUrl) {
      throw new Error('jitbit-helpdesk requires credentials.extra.baseUrl')
    }
    const authScheme = String(credentials.extra?.['authScheme'] ?? 'Bearer')
    const authHeader = `${authScheme} ${credentials.accessToken}`

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: authHeader,
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
      // Jitbit accepts form-encoded or query-string params; we use JSON for POST
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  /** Build pagination params from offset + page size. */
  static pageParams(offset: number, count: number = DEFAULT_PAGE_SIZE): Record<string, number> {
    return { offset, count }
  }
}
