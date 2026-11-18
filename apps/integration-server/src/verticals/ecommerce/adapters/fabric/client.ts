/**
 * fabric API client.
 *
 * Key characteristics:
 *  - Base URL: `https://api.fabric.inc/v3/`
 *  - Auth: `Authorization: Bearer {access_token}` + `x-api-key: {apiKey}` headers.
 *  - Responses use a standard envelope: `{ data, pagination }` for lists.
 *  - Pagination: `offset` + `limit` query params.
 *  - Exponential-backoff retry on 429 + 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, CONTENT_TYPE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

// ── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

// ── Response types ───────────────────────────────────────────────────────────

export interface FabricListResponse<T> {
  data: T[]
  pagination?: {
    offset?: number
    limit?: number
    total?: number
    count?: number
  }
}

export interface FabricListResult<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

// ── Client ───────────────────────────────────────────────────────────────────

export class FabricClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const apiKey = credentials.extra?.['apiKey'] as string | undefined

    if (!token) {
      throw new Error('FabricClient: credentials.accessToken is required')
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': CONTENT_TYPE,
      Accept: CONTENT_TYPE,
    }
    if (apiKey) {
      headers['x-api-key'] = apiKey
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * List resources with offset + limit pagination.
   */
  async list<T>(
    path: string,
    options: { offset?: number; limit?: number; params?: Record<string, unknown> } = {},
  ): Promise<FabricListResult<T>> {
    const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = options.offset ?? 0
    const params: Record<string, unknown> = {
      ...options.params,
      offset,
      limit,
    }
    return withRetry(async () => {
      const { data } = await this.http.get<FabricListResponse<T> | T[]>(path, { params })
      if (Array.isArray(data)) {
        return { items: data, total: data.length, offset, limit }
      }
      const items = data.data ?? []
      const total =
        data.pagination?.total ?? data.pagination?.count ?? items.length
      return { items, total, offset, limit }
    })
  }
}
