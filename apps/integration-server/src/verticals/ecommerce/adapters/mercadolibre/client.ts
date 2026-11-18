/**
 * Mercado Libre REST API HTTP client.
 *
 * Auth header is `Authorization: Bearer <accessToken>`.
 * Pagination uses `offset` + `limit` with `paging.total` in the response.
 * Retries follow exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

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

export interface ListResult<T> {
  items: T[]
  total?: number
  offset?: number
  limit?: number
}

export class MeliClient {
  private http: AxiosInstance
  readonly userId: string

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'MeliClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.userId = (credentials.extra?.['userId'] as string | undefined) ?? ''
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * List helper for ML's offset-based pagination.
   *
   * ML search endpoints return `{ paging: { total, offset, limit }, results: [...] }`.
   * Item detail endpoints are fetched individually.
   */
  async list<T>(
    path: string,
    resourceKey: string,
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = (params['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const offset = (params['offset'] as number | undefined) ?? 0
    const qp = { ...params, limit, offset }
    const data = await this.get<Record<string, unknown>>(path, qp)

    const items = Array.isArray(data[resourceKey]) ? (data[resourceKey] as T[]) : []
    const paging = data['paging'] as { total?: number; offset?: number; limit?: number } | undefined
    const total = paging?.total ?? (typeof data['total'] === 'number' ? data['total'] : undefined)

    return { items, total, offset, limit }
  }
}
