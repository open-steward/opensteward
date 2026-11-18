/**
 * Ecwid REST API client.
 *
 * Features:
 *  - Bearer token auth via the store's secret API token.
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithPage` helper that reads Ecwid's offset-based pagination
 *    (count, total, offset, limit) and returns the next offset.
 *
 * Docs: https://developer.ecwid.com/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
  nextOffset?: number
}

/**
 * Ecwid returns search results wrapped in an envelope with pagination
 * metadata: `{ total, count, offset, limit, items }`.
 */
interface EcwidSearchResponse<T> {
  total?: number
  count?: number
  offset?: number
  limit?: number
  items?: T[]
}

export class EcwidClient {
  private http: AxiosInstance
  private storeId: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const storeId =
      (credentials.extra?.['storeId'] as string | undefined) ?? ''

    if (!token) {
      throw new Error(
        'EcwidClient: credentials.accessToken is required (secret API token)',
      )
    }
    if (!storeId) {
      throw new Error(
        'EcwidClient: credentials.extra.storeId is required',
      )
    }

    this.storeId = storeId
    this.http = axios.create({
      baseURL: `${API_BASE}/${storeId}`,
      headers: {
        Authorization: `Bearer ${token}`,
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

  getStoreId(): string {
    return this.storeId
  }

  /**
   * List helper for Ecwid's offset-based pagination. Ecwid search
   * endpoints (products, orders, customers, discount_coupons) return
   * `{ total, count, offset, limit, items }`.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams['offset'] as number | undefined) ?? 0

    const params: Record<string, unknown> = { ...extraParams }
    params['limit'] = limit
    params['offset'] = offset

    const data = await this.get<EcwidSearchResponse<T>>(path, params)
    const items = data.items ?? []
    const total = data.total

    // Calculate next offset if there are more items
    const nextOffset =
      total != null && offset + items.length < total
        ? offset + items.length
        : undefined

    return { items, total, nextOffset }
  }
}
