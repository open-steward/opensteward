/**
 * ePages Beyond REST client.
 *
 * - `Authorization: Bearer <token>` (the JWT minted by ./auth.ts).
 * - HAL+JSON: list responses wrap items under `_embedded.<resourceName>`
 *   (https://api-docs.beyondshop.cloud/index-api-basics.html#hypermedia).
 * - Pagination is `page` (0-indexed) + `size` + `sort`
 *   (https://api-docs.beyondshop.cloud/index-api-basics.html#pagination).
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { apiBaseUrl } from './auth'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface PageParams {
  page?: number
  size?: number
  sort?: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  totalPages?: number
  totalElements?: number
}

interface HalPage<T> {
  _embedded?: Record<string, T[]>
  page?: { size: number; totalElements: number; totalPages: number; number: number }
}

export class EpagesClient {
  private http: AxiosInstance
  private shop: string

  constructor(credentials: Credentials) {
    const shop = credentials.extra?.['shop'] as string | undefined
    if (!shop) {
      throw new Error(
        'ePages Beyond adapter is missing `shop` in credentials.extra — re-create the connection.',
      )
    }
    this.shop = shop
    this.http = axios.create({
      baseURL: apiBaseUrl(shop),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/hal+json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  get shopHost(): string {
    return this.shop
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper for Beyond's `_embedded.<resourceName>` HAL envelope.
   * `resourceName` is the plural key Beyond uses for this collection
   * (e.g. `products`, `categories`, `customers`).
   */
  async listPage<T>(
    path: string,
    resourceName: string,
    params: PageParams = {},
    extra: Record<string, unknown> = {},
  ): Promise<PageResult<T>> {
    const size = Math.min(params.size ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 0
    const query: Record<string, unknown> = { page, size, ...extra }
    if (params.sort) query.sort = params.sort

    const data = await this.get<HalPage<T>>(path, query)
    return {
      items: data._embedded?.[resourceName] ?? [],
      page: data.page?.number ?? page,
      totalPages: data.page?.totalPages,
      totalElements: data.page?.totalElements,
    }
  }
}
