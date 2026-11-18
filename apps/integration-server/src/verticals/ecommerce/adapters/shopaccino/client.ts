/**
 * Shopify Admin REST API client.
 *
 * Features:
 *  - `X-Shopify-Access-Token` auth header (NOT `Authorization: Bearer`).
 *  - Simple 429 retry with exponential backoff.
 *  - `listWithCursor` helper that parses the `Link` header to extract the
 *    Shopify `page_info` cursor for the next page.
 */

import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

/**
 * Parse Shopify's Link header to extract the `page_info` cursor for the
 * next page, if any.
 *
 * Example header:
 *   Link: <https://x.myshopify.com/admin/api/2025-01/products.json?limit=50&page_info=abc>; rel="next"
 */
export function parseNextCursor(linkHeader: string | undefined): string | undefined {
  if (!linkHeader) return undefined
  // Link header can contain multiple rels separated by commas
  const parts = linkHeader.split(',')
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/i)
    if (match) {
      try {
        const url = new URL(match[1]!)
        const pageInfo = url.searchParams.get('page_info')
        return pageInfo ?? undefined
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export interface ListResult<T> {
  items: T[]
  nextCursor?: string
}

export class ShopifyClient {
  private http: AxiosInstance
  private shopHost: string

  constructor(credentials: Credentials, shop: string) {
    this.shopHost = shop.endsWith('.myshopify.com') ? shop : `${shop}.myshopify.com`
    this.http = axios.create({
      baseURL: `https://${this.shopHost}/admin/api/${API_VERSION}`,
      headers: {
        'X-Shopify-Access-Token': credentials.accessToken,
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

  /**
   * Variant of `get` that also returns the raw axios response so the caller
   * can inspect headers — used by `listWithCursor`.
   */
  async getRaw<T>(path: string, params?: Record<string, unknown>): Promise<AxiosResponse<T>> {
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper that follows Shopify's cursor-based pagination. The caller
   * passes the `resourceKey` (e.g. `products`) matching the top-level key in
   * the response envelope — Shopify wraps list responses in
   * `{ products: [...] }`.
   */
  async listWithCursor<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const params: Record<string, unknown> = {
      limit: Math.min((extraParams.limit as number) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...extraParams,
    }
    // Shopify uses `page_info` for cursor-based pagination. When `page_info`
    // is present, ONLY `limit` and `fields` may be sent alongside it.
    if (params.page_info) {
      const cursor = params.page_info
      for (const k of Object.keys(params)) delete params[k]
      params.page_info = cursor
      params.limit = Math.min(
        (extraParams.limit as number) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      )
    }

    const res = await this.getRaw<Record<string, T[]>>(path, params)
    const link = (res.headers['link'] ?? res.headers['Link']) as string | undefined
    return {
      items: (res.data[resourceKey] ?? []) as T[],
      nextCursor: parseNextCursor(link),
    }
  }
}
