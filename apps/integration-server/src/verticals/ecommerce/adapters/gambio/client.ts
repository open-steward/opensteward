/**
 * WooCommerce REST API client.
 *
 * Features:
 *  - HTTP Basic auth header built from consumer key + secret. WC documents
 *    query-string auth as a fallback for non-HTTPS sites, but we require
 *    HTTPS in practice (consumer keys must not transit as query params).
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithPage` helper that reads page-based pagination metadata
 *    (`X-WP-Total`, `X-WP-TotalPages`, `Link: rel="next"`) and returns
 *    the next page number so callers can iterate deterministically.
 *
 * Intentional parallel with `apps/integration-server/src/verticals/ecommerce/adapters/shopify/client.ts`
 * (no shared CircuitBreaker — consistency across adapters wins over
 * another layer of retry policy).
 */

import axios, { type AxiosInstance, type AxiosError, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

/**
 * Parse WooCommerce's `Link` header to extract the next page number, if
 * any. WC mirrors the WP REST convention:
 *
 *   Link: <https://store.example/wp-json/wc/v3/products?page=2>; rel="next",
 *         <https://store.example/wp-json/wc/v3/products?page=5>; rel="last"
 */
export function parseNextPage(linkHeader: string | undefined): number | undefined {
  if (!linkHeader) return undefined
  const parts = linkHeader.split(',')
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/i)
    if (match) {
      try {
        const url = new URL(match[1]!)
        const page = url.searchParams.get('page')
        if (!page) return undefined
        const n = parseInt(page, 10)
        return Number.isNaN(n) ? undefined : n
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

export class WooCommerceClient {
  private http: AxiosInstance
  private baseUrl: string

  constructor(credentials: Credentials) {
    const consumerKey = credentials.accessToken
    const consumerSecret = credentials.extra?.['consumerSecret'] as string | undefined
    const site = credentials.extra?.['site'] as string | undefined

    if (!consumerSecret) {
      throw new Error(
        'WooCommerceClient: credentials.extra.consumerSecret is required',
      )
    }
    if (!site) {
      throw new Error(
        'WooCommerceClient: credentials.extra.site is required (e.g. https://shop.example.com)',
      )
    }

    this.baseUrl = `${site.replace(/\/$/, '')}/wp-json/wc/${API_VERSION}`
    const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Basic ${basic}`,
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
   * List helper that follows WooCommerce's page-based pagination. Mirrors
   * Shopify's `listWithCursor` shape so the calling adapter code stays
   * structurally similar across platforms.
   *
   * Response headers consulted:
   *  - `X-WP-Total`       total number of items across all pages
   *  - `X-WP-TotalPages`  total number of pages
   *  - `Link`             `rel="next"` link carrying the next `?page=N`
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      (extraParams['per_page'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    // Strip synonyms we handled ourselves so we don't send both.
    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['per_page'] = perPage
    params['page'] = page

    const res = await this.getRaw<T[]>(path, params)
    const linkHeader = (res.headers['link'] ?? res.headers['Link']) as string | undefined
    const totalHeader = res.headers['x-wp-total'] as string | undefined
    const totalPagesHeader = res.headers['x-wp-totalpages'] as string | undefined
    const nextFromLink = parseNextPage(linkHeader)

    return {
      items: (res.data ?? []) as T[],
      nextPage: nextFromLink,
      totalPages: totalPagesHeader ? parseInt(totalPagesHeader, 10) : undefined,
      totalItems: totalHeader ? parseInt(totalHeader, 10) : undefined,
    }
  }
}
