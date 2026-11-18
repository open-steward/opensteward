/**
 * Shopgate Omnichannel REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {token}` auth header.
 *  - Per-service AxiosInstance constructed from service name + env suffix:
 *      https://{service}.shopgate{env}.io/v1/merchants/{merchantCode}
 *  - Simple 429 / 5xx retry with exponential backoff.
 *  - `listWithOffset` helper for offset-based pagination — Shopgate uses
 *    `offset` + `limit` query parameters and returns a top-level `meta`
 *    object with `{ limit, offset, totalItemCount }`.
 *
 * Docs: https://docs.shopgate.com/docs/retail-red
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import type { ServiceName } from './constants'

export interface ListResult<T> {
  items: T[]
  /** Next offset to pass to retrieve the next page, undefined when exhausted. */
  nextOffset?: number
  total?: number
}

/**
 * Build the base URL for a Shopgate service:
 *   https://{service}.shopgate{envSuffix}.io/v1/merchants/{merchantCode}
 */
function buildBaseUrl(
  service: ServiceName,
  merchantCode: string,
  envSuffix: string,
): string {
  return `https://${service}.shopgate${envSuffix}.io/${API_VERSION}/merchants/${merchantCode}`
}

export class ShopgateClient {
  private instances: Map<ServiceName, AxiosInstance> = new Map()
  private bearerToken: string
  private merchantCode: string
  private envSuffix: string

  constructor(credentials: Credentials) {
    this.bearerToken = credentials.accessToken
    const extra = credentials.extra as Record<string, string> | undefined
    this.merchantCode = extra?.['merchantCode'] ?? ''
    this.envSuffix = extra?.['envSuffix'] ?? ''

    if (!this.merchantCode) {
      throw new Error(
        'ShopgateClient: credentials.extra.merchantCode is required',
      )
    }
  }

  private http(service: ServiceName): AxiosInstance {
    let instance = this.instances.get(service)
    if (!instance) {
      instance = axios.create({
        baseURL: buildBaseUrl(service, this.merchantCode, this.envSuffix),
        headers: {
          Authorization: `Bearer ${this.bearerToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 30_000,
      })
      this.instances.set(service, instance)
    }
    return instance
  }

  async get<T>(service: ServiceName, path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http(service).get<T>(path, { params })
      return data
    })
  }

  async post<T>(service: ServiceName, path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http(service).post<T>(path, body)
      return data
    })
  }

  async put<T>(service: ServiceName, path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http(service).put<T>(path, body)
      return data
    })
  }

  async patch<T>(service: ServiceName, path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http(service).patch<T>(path, body)
      return data
    })
  }

  async delete(service: ServiceName, path: string, body?: unknown): Promise<void> {
    return withRetry(async () => {
      await this.http(service).delete(path, body ? { data: body } : undefined)
    })
  }

  /**
   * Paginated list helper using Shopgate's offset+limit pagination.
   *
   * Shopgate list responses wrap items in a named key (e.g. `products`,
   * `orders`) and include a `meta` object with `{ limit, offset, totalItemCount }`.
   *
   * Response envelope example:
   *   { products: [...], meta: { limit: 50, offset: 0, totalItemCount: 200 } }
   */
  async listWithOffset<T>(
    service: ServiceName,
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams['offset'] as number | undefined) ?? 0
    const params: Record<string, unknown> = { ...extraParams, limit, offset }

    const res = await this.get<Record<string, unknown>>(service, path, params)
    const items = (res[resourceKey] as T[] | undefined) ?? []
    // Shopgate's documented meta is `{ limit, offset, totalItemCount }`; there
    // is no `total` key, so reading one never found the end of a list.
    const meta = res['meta'] as
      | { limit?: number; offset?: number; totalItemCount?: number }
      | undefined
    const total = meta?.totalItemCount
    const nextOffset = total != null && offset + limit < total ? offset + limit : undefined

    return { items, nextOffset, total }
  }
}
