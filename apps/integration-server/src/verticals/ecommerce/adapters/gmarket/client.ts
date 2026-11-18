/**
 * Gmarket REST API HTTP client.
 *
 * Auth header is `Authorization: Bearer <apiKey>` with an additional
 * `X-Gmarket-Seller-Id` header when a seller ID is present.
 * Pagination uses `page` + `pageSize` with `totalCount` in responses.
 * Retries follow exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

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
  totalCount?: number
  page?: number
  pageSize?: number
}

export class GmarketClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'GmarketClient: credentials.accessToken (API key) is required.',
      )
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    const sellerId = credentials.extra?.['sellerId'] as string | undefined
    if (sellerId) {
      headers['X-Gmarket-Seller-Id'] = sellerId
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

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * List helper for Gmarket's page-based pagination.
   */
  async list<T>(
    path: string,
    resourceKey: string,
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = (params['pageSize'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const page = (params['page'] as number | undefined) ?? 1
    const qp = { ...params, page, pageSize }
    const data = await this.get<Record<string, unknown>>(path, qp)

    const items = Array.isArray(data[resourceKey]) ? (data[resourceKey] as T[]) : []
    const totalCount = typeof data['totalCount'] === 'number' ? data['totalCount'] : undefined

    return { items, totalCount, page, pageSize }
  }
}
