/**
 * nopCommerce REST API client.
 *
 * Features:
 *  - Bearer token auth via the `Authorization` header.
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithPage` helper that reads nopCommerce page-based pagination
 *    and returns the next page number so callers can iterate deterministically.
 *
 * Docs: https://docs.nopcommerce.com/en/developer/web-api/index.html
 */

import axios, { type AxiosInstance, type AxiosError, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

export class NopCommerceClient {
  private http: AxiosInstance
  private baseUrl: string

  constructor(credentials: Credentials) {
    const apiToken = credentials.accessToken
    const host = credentials.extra?.['host'] as string | undefined

    if (!apiToken) {
      throw new Error(
        'NopCommerceClient: credentials.accessToken (API token) is required',
      )
    }
    if (!host) {
      throw new Error(
        'NopCommerceClient: credentials.extra.host is required (e.g. https://shop.example.com)',
      )
    }

    this.baseUrl = `${host.replace(/\/$/, '')}/api`
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${apiToken}`,
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

  async getRaw<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<AxiosResponse<T>> {
    return withRetry(async () => {
      return await this.http.get<T>(path, { params })
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
   * List helper that follows nopCommerce's page-based pagination.
   *
   * nopCommerce API returns items in a wrapper object (e.g. `{ products: [...] }`)
   * with pagination info. The `wrapperKey` parameter specifies which key to
   * extract from the response.
   *
   * The API supports `limit` (per_page) and `page` query parameters, and
   * returns `count` for total items in the response or via separate count
   * endpoints.
   */
  async listWithPage<T>(
    path: string,
    wrapperKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ??
        (extraParams['per_page'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    delete params['per_page']
    params['limit'] = limit
    params['page'] = page

    const res = await this.getRaw<Record<string, unknown>>(path, params)
    const items = ((res.data[wrapperKey] ?? []) as T[])
    const count = res.data['count'] as number | undefined

    // Determine next page: if we got a full page, there may be more.
    const hasMore = items.length >= limit
    const nextPage = hasMore ? page + 1 : undefined

    return {
      items,
      nextPage,
      totalItems: count,
    }
  }
}
