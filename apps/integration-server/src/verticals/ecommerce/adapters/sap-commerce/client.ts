/**
 * SAP Commerce Cloud OCC API client.
 *
 * Features:
 *  - `Authorization: Bearer {access_token}` auth header, scoped to
 *    `https://{host}/occ/v2/{baseSiteId}/` base URL.
 *  - Exponential-backoff retry on 429 + 5xx.
 *  - `listWithPagination` helper for page-based pagination.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_BASE_SITE } from './constants'

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
  page: number
  pageSize: number
}

/**
 * Raw shape of SAP Commerce OCC paginated response. List endpoints return
 * `{[resourceKey]: T[], pagination: {currentPage, pageSize, totalPages, totalResults}}`.
 */
export interface SapPagedResponse {
  pagination?: {
    currentPage: number
    pageSize: number
    totalPages: number
    totalResults: number
  }
  sorts?: unknown[]
  [key: string]: unknown
}

export class SapCommerceClient {
  private http: AxiosInstance
  readonly host: string
  readonly baseSiteId: string

  constructor(credentials: Credentials) {
    const host = credentials.extra?.['host'] as string | undefined
    const baseSiteId =
      (credentials.extra?.['baseSiteId'] as string | undefined) ?? DEFAULT_BASE_SITE
    if (!host) {
      throw new Error('SapCommerceClient: credentials.extra.host is required')
    }
    this.host = host
    this.baseSiteId = baseSiteId
    this.http = axios.create({
      baseURL: `https://${host}/occ/v2/${baseSiteId}`,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }

  /**
   * Page-based pagination helper. SAP Commerce OCC returns paginated
   * responses with a `pagination` object containing `currentPage`,
   * `pageSize`, `totalPages`, and `totalResults`.
   */
  async listWithPagination<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams['pageSize'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['currentPage'] as number | undefined) ??
      (extraParams['page'] as number | undefined) ?? 0

    const params: Record<string, unknown> = { ...extraParams, pageSize, currentPage: page }
    delete params['limit']
    delete params['page']

    const res = await this.get<SapPagedResponse & Record<string, unknown>>(path, params)
    const items = (res[resourceKey] as T[] | undefined) ?? []
    return {
      items,
      total: res.pagination?.totalResults,
      page: res.pagination?.currentPage ?? page,
      pageSize: res.pagination?.pageSize ?? pageSize,
    }
  }
}
