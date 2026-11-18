/**
 * Foxy.io hAPI client.
 *
 * Features:
 *  - `Authorization: Bearer` auth header.
 *  - `FOXY-API-VERSION: 1` version header on every request.
 *  - HAL+JSON responses — collections are in `_embedded['fx:<resource>']`.
 *  - Offset/limit pagination: responses include `total_items`, `offset`,
 *    `limit` at the top level. Next-page offset is computed from these.
 *  - Resources live under `https://api.foxycart.com/stores/{storeId}/{resource}`.
 *
 * Docs: https://api.foxycart.com/docs
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

/** HAL collection envelope returned by Foxy list endpoints. */
export interface FoxyCollectionResponse<T> {
  total_items: number
  returned_items: number
  offset: number
  limit: number
  _embedded?: Record<string, T[]>
  _links?: Record<string, { href: string }>
}

export interface ListResult<T> {
  items: T[]
  /** Offset to pass for the next page, or undefined if this is the last page. */
  nextOffset?: number
  /** `total_items` as Foxy reported it, when it did. */
  totalCount?: number
}

export class FoxyClient {
  private http: AxiosInstance
  readonly storeId: string

  constructor(credentials: Credentials, storeId: string) {
    this.storeId = storeId
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'FOXY-API-VERSION': API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Build a store-scoped path, e.g. `stores/42/customers`. */
  storePath(resource: string): string {
    return `/stores/${this.storeId}/${resource}`
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Fetch a HAL collection from the given store-relative resource path.
   *
   * Foxy embeds collection items under `_embedded['fx:<embeddedKey>']`.
   * The `embeddedKey` is typically the singular or plural rel name, e.g.
   * `fx:customers`, `fx:transactions`, `fx:coupons`.
   *
   * Returns `items` and `nextOffset` (undefined when on the last page).
   */
  async listEmbedded<T>(
    resource: string,
    embeddedKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      ((extraParams.limit as number | undefined) ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams.offset as number | undefined) ?? 0
    const params: Record<string, unknown> = {
      ...extraParams,
      limit,
      offset,
    }

    const res = await this.get<FoxyCollectionResponse<T>>(
      this.storePath(resource),
      params,
    )

    const items: T[] = res._embedded?.[embeddedKey] ?? []
    const fetched = offset + (res.returned_items ?? items.length)
    const total = res.total_items ?? fetched
    const nextOffset = fetched < total ? fetched : undefined

    return {
      items,
      nextOffset,
      ...(typeof res.total_items === 'number' ? { totalCount: res.total_items } : {}),
    }
  }
}
