/**
 * IZBERG (iceberg.technology) Merchant REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {token}` header. The public spec
 *    (https://docs-api.izberg-marketplace.com/swagger.json) secures every
 *    operation with `"security": [{ "bearerAuth": [] }]`, where
 *    `bearerAuth` is `{ "type": "http", "scheme": "bearer" }`, and its
 *    examples send `Authorization: Bearer <your_token>`.
 *  - Offset-based pagination: `?limit=N&offset=N`. The response envelope is
 *    `{ objects: T[], meta: { total_count, limit, offset, next, previous } }`.
 *  - Retry with exponential back-off on 429 and 5xx responses.
 *
 * Auth is injected via the `Credentials` object: `credentials.accessToken`
 * is the seller authorization token.
 *
 * Docs: https://docs-api-merchant.izberg-marketplace.com/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  API_VERSION,
  PROD_BASE_URL,
  SANDBOX_BASE_URL,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'

/** Shared response envelope for list endpoints. */
export interface IcebergListResponse<T> {
  objects: T[]
  meta: {
    total_count?: number
    limit?: number
    offset?: number
    next?: string | null
    previous?: string | null
  }
}

export interface ListResult<T> {
  items: T[]
  /** Offset of the next page, or undefined when there are no more pages. */
  nextOffset?: number
  totalCount?: number
  /**
   * Whether rows exist past this page: `meta.next` when the envelope carries
   * it (null on the last page), else `meta.total_count` against the rows
   * served so far, else `undefined` (not known).
   */
  hasMore?: boolean
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1_000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class IzbergClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, sandbox = false) {
    const baseUrl = sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL
    const authHeader = `Bearer ${credentials.accessToken}`

    this.http = axios.create({
      baseURL: `${baseUrl}/${API_VERSION}/`,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Language': 'en',
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
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
   * List helper that reads IZBERG's `{ objects, meta }` envelope and returns
   * the items together with the next offset for cursor iteration.
   *
   * @param path  Resource path without leading slash, e.g. `productoffer/`.
   * @param extra Additional query params (filters, ordering, etc.).
   */
  async listWithOffset<T>(
    path: string,
    extra: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extra['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extra['offset'] as number | undefined) ?? 0

    const params: Record<string, unknown> = {
      ...extra,
      limit,
      offset,
    }

    const res = await this.get<IcebergListResponse<T>>(path, params)
    const objects = res?.objects ?? []
    const totalCount = res?.meta?.total_count ?? objects.length
    const currentOffset = offset + objects.length
    const nextOffset = currentOffset < totalCount ? currentOffset : undefined
    const meta = res?.meta
    const hasMore =
      meta?.next !== undefined
        ? meta.next != null
        : meta?.total_count !== undefined
          ? currentOffset < meta.total_count
          : undefined

    return {
      items: objects,
      nextOffset,
      totalCount,
      hasMore,
    }
  }
}
