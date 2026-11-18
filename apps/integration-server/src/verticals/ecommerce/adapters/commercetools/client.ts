/**
 * commercetools Composable Commerce API client.
 *
 * Features:
 *  - `Authorization: Bearer {access_token}` auth header, scoped to a
 *    regional `api.{region}.commercetools.com/{projectKey}` base URL.
 *  - Exponential-backoff retry on 429 + 5xx (mirrors Shopify/WooCommerce).
 *  - `listWithOffset` helper for offset+limit pagination, with a guard
 *    against commercetools' 10,000-item hard cap.
 *  - Actions-based updates are POST requests built by the adapter; this
 *    client just exposes generic `post` so callers can wire up
 *    `{version, actions}` bodies for each resource.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_PAGE_SIZE,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  REGIONS,
  DEFAULT_REGION,
} from './constants'

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
  offset: number
  count: number
  nextOffset?: number
}

/**
 * Raw shape of commercetools' paginated response envelope. Every list
 * endpoint (products, orders, customers, etc.) returns `{limit, offset,
 * count, total?, results: T[]}`.
 */
export interface CommerceToolsPagedResponse<T> {
  limit: number
  offset: number
  count: number
  total?: number
  results: T[]
}

export class CommerceToolsClient {
  private http: AxiosInstance
  readonly projectKey: string
  readonly apiHost: string

  constructor(credentials: Credentials) {
    const projectKey = credentials.extra?.['projectKey'] as string | undefined
    const region = (credentials.extra?.['region'] as string | undefined) ?? DEFAULT_REGION
    if (!projectKey) {
      throw new Error(
        'CommerceToolsClient: credentials.extra.projectKey is required',
      )
    }
    const entry = REGIONS[region]
    if (!entry) {
      throw new Error(
        `CommerceToolsClient: unknown region '${region}'. Supported: ${Object.keys(REGIONS).join(', ')}`,
      )
    }
    this.projectKey = projectKey
    this.apiHost = entry.apiHost
    this.http = axios.create({
      baseURL: `https://${this.apiHost}/${projectKey}`,
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

  async delete<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }

  /**
   * Offset-based pagination helper. commercetools envelopes list responses
   * as `{limit, offset, count, total, results}`; this helper unwraps them
   * and computes the next offset. Offsets past {@link MAX_OFFSET} are
   * refused — commercetools simply returns 400 there and the platform
   * recommends `lastId` / `where` windowing for deep iteration, which
   * this adapter does not implement.
   */
  async listWithOffset<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams['offset'] as number | undefined) ?? 0
    if (offset > MAX_OFFSET) {
      throw new Error(
        `commercetools listWithOffset: offset ${offset} exceeds the platform hard cap of ${MAX_OFFSET}. Use filtered queries instead of deep pagination.`,
      )
    }
    const params: Record<string, unknown> = { ...extraParams, limit, offset }
    const res = await this.get<CommerceToolsPagedResponse<T>>(path, params)
    const nextOffset =
      res.count === limit && offset + limit <= MAX_OFFSET ? offset + limit : undefined
    return {
      items: res.results ?? [],
      total: res.total,
      offset: res.offset,
      count: res.count,
      nextOffset,
    }
  }
}
