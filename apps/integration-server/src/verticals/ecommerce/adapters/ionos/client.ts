/**
 * IONOS ecommerce API client.
 *
 * Features:
 *  - Bearer token auth via API key in Authorization header.
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithPagination` helper for offset/limit-based pagination.
 *
 * Auth: `Authorization: Bearer <api-key>`
 * Base URL: configurable (defaults to https://api.ionos.com/ecommerce/v1)
 *
 * Docs: https://developer.hosting.ionos.com/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        const retryAfter =
          axiosErr.response?.headers?.['retry-after'] != null
            ? parseInt(String(axiosErr.response.headers['retry-after']), 10) * 1000
            : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, retryAfter))
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

export class IonosClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? BASE_URL

    if (!apiKey) {
      throw new Error('IonosClient: credentials.accessToken (API key) is required')
    }

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper for IONOS offset/limit-based pagination.
   * IONOS typically returns `{ items: [...], total: N }` or similar shapes.
   */
  async listWithPagination<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams['offset'] as number | undefined) ?? 0

    const params: Record<string, unknown> = { ...extraParams, limit, offset }
    delete params['page']

    // IONOS may return `{ items, total }` or `{ products, total }` or similar.
    // We cast to unknown and handle gracefully.
    const res = await this.get<unknown>(path, params)
    const resObj = res as Record<string, unknown>

    // Try common envelope keys in order of preference.
    const items =
      (resObj['items'] as T[] | undefined) ??
      (resObj['products'] as T[] | undefined) ??
      (resObj['orders'] as T[] | undefined) ??
      (Array.isArray(res) ? (res as T[]) : [])

    const total =
      (resObj['total'] as number | undefined) ??
      (resObj['totalCount'] as number | undefined) ??
      (resObj['count'] as number | undefined)

    const hasMore = total != null ? offset + items.length < total : items.length >= limit
    const nextOffset = hasMore ? offset + items.length : undefined

    return { items, total, nextOffset }
  }
}
