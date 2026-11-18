/**
 * VARIO Cloud API HTTP client.
 *
 * Base URL: https://{tenant}.vario.cloud/api/vario
 * Auth:     Authorization: Bearer {access_token}
 *           User-Agent: required (403 if missing)
 * Rate:     40 req / 6 s — retries on 429 using x-rate-limit-retry-after-seconds
 * Pagination (VQL POST body): limit + offset fields.
 *             Response headers x-query-more-elements / x-query-next-offset.
 * Pagination (stockjournal REST): JSON-serialised selection+pageable query params.
 */
import axios, { type AxiosInstance, type AxiosError, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE, USER_AGENT } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryAfterSec = Number((axiosErr.response as AxiosResponse | undefined)?.headers?.['x-rate-limit-retry-after-seconds'] ?? 0)
      if (status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, Math.max((retryAfterSec || 6) * 1000, 6_000)))
        continue
      }
      if (status !== undefined && status >= 500 && status < 600 && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1_000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  nextOffset: number | undefined
}

export class VarioSoftwareClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const tenant = String(credentials.extra?.['tenant'] ?? '')
    if (!tenant) throw new Error('vario-software requires credentials.extra.tenant')

    const baseURL = API_BASE_URL_TEMPLATE.replace('{tenant}', tenant)

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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

  /** GET with full response so callers can inspect pagination headers. */
  async getWithHeaders<T>(path: string, params?: Record<string, unknown>): Promise<{ data: T; headers: Record<string, string> }> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      return { data: res.data, headers: res.headers as Record<string, string> }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  /**
   * Execute a VQL computed query and return a page of results with
   * pagination cursors from response headers.
   */
  async vql<T>(statement: string, limit: number, offset: number): Promise<PaginatedResult<T>> {
    return withRetry(async () => {
      const res = await this.http.post<T[]>(
        '/cmn/computed-queries/execute',
        { statement, limit, offset },
      )
      const hasMore = String(res.headers['x-query-more-elements']).toLowerCase() === 'true'
      const nextOffsetHeader = res.headers['x-query-next-offset']
      const nextOffset = nextOffsetHeader !== undefined ? Number(nextOffsetHeader) : undefined
      return { items: res.data ?? [], hasMore, nextOffset }
    })
  }
}
