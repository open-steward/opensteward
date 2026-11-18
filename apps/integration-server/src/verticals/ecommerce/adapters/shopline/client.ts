/**
 * SHOPLINE Admin REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {accessToken}` auth header.
 *  - Simple 429 / 5xx retry with exponential backoff.
 *  - `listWithCursor` helper that parses the `link` response header to extract
 *    the SHOPLINE `page_info` cursor for the next page.
 *
 * SHOPLINE cursor pagination mirrors Shopify's approach: the `link` header
 * contains a next-page URL whose `page_info` query parameter is an opaque
 * base64-encoded cursor.
 *
 * Docs: https://developer.shopline.com/docs/apps/api-instructions-for-use/rest-admin-api/overview/
 */

import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

/**
 * Parse SHOPLINE's `link` response header to extract the `page_info` cursor
 * for the next page, if any.
 *
 * Example header:
 *   link: <https://store.myshopline.com/admin/openapi/v20260301/products/products.json?limit=50&page_info=eyJ...>; rel="next"
 */
export function parseNextCursor(linkHeader: string | undefined): string | undefined {
  if (!linkHeader) return undefined
  const parts = linkHeader.split(',')
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/i)
    if (match) {
      try {
        const url = new URL(match[1]!)
        return url.searchParams.get('page_info') ?? undefined
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

export class ShoplineClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, handle: string) {
    this.http = axios.create({
      baseURL: buildBaseUrl(handle),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
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
   * List helper that follows SHOPLINE's cursor-based pagination. The caller
   * passes the `resourceKey` (e.g. `products`) matching the top-level key in
   * the response envelope — SHOPLINE wraps list responses in e.g.
   * `{ products: [...] }`.
   *
   * When `page_info` is present in `extraParams`, ONLY `limit` and `page_info`
   * are forwarded (SHOPLINE ignores filter params on cursor pages).
   */
  async listWithCursor<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams.limit as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )

    let params: Record<string, unknown>
    if (extraParams.page_info) {
      // Cursor page: send only page_info + limit.
      params = { page_info: extraParams.page_info, limit }
    } else {
      params = { ...extraParams, limit }
    }

    const res = await this.getRaw<Record<string, T[]>>(path, params)
    const link = (res.headers['link'] ?? res.headers['Link']) as string | undefined
    return {
      items: (res.data[resourceKey] ?? []) as T[],
      nextCursor: parseNextCursor(link),
    }
  }
}
