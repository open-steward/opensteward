/**
 * Rakuten RMS HTTP client.
 *
 * Wraps axios with:
 *   - RMS ESA Authorization header (`ESA base64(serviceSecret:licenseKey)`)
 *   - Retry logic for transient 429 / 5xx errors
 *   - JSON request/response handling
 *
 * The RMS API returns XML by default; we request JSON via
 * `Accept: application/json` and `Content-Type: application/json`.
 *
 * Pagination: RMS uses `offset` (0-based) and `limit` query params.
 * Response envelopes include a `paginationReturnMeta` object with
 * `totalCount`, `pageCount`, and `currentPage`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildEsaHeader } from './auth'
import { RMS_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 500))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export interface RmsListMeta {
  totalCount?: number
  pageCount?: number
  currentPage?: number
}

export interface RmsListResult<T> {
  items: T[]
  meta: RmsListMeta
}

export class RakutenClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const authHeader = buildEsaHeader(credentials)

    this.http = axios.create({
      baseURL: RMS_BASE_URL,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
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

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path)
      return data
    })
  }

  /**
   * Paginated list helper.
   * RMS uses `offset` / `limit` with a `paginationReturnMeta` envelope.
   *
   * @param path     RMS endpoint path
   * @param listKey  Key inside the response body that holds the array
   * @param params   Extra query params (offset, limit, etc.)
   */
  async listPaginated<T>(
    path: string,
    listKey: string,
    params: Record<string, unknown> = {},
  ): Promise<RmsListResult<T>> {
    const merged = {
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
      ...params,
    }
    const data = await this.get<Record<string, unknown>>(path, merged)

    const items: T[] = Array.isArray(data[listKey])
      ? (data[listKey] as T[])
      : []

    const rawMeta = data['paginationReturnMeta'] as Record<string, unknown> | undefined
    const meta: RmsListMeta = {
      totalCount: rawMeta?.['totalCount'] as number | undefined,
      pageCount: rawMeta?.['pageCount'] as number | undefined,
      currentPage: rawMeta?.['currentPage'] as number | undefined,
    }

    return { items, meta }
  }
}
