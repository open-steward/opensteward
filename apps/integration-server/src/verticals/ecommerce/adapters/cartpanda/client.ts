/**
 * CartPanda REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {token}` auth header.
 *  - Store-scoped base URL: `https://app.cartpanda.com/api/v2/{slug}/`.
 *  - Page-based pagination via `page` / `per_page` query parameters.
 *  - 429 and 5xx retry with exponential backoff.
 *
 * Docs: https://dev.cartpanda.com/docs/cartx-api-doc
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  nextPage?: number
}

export class CartpandaClient {
  private http: AxiosInstance
  private slug: string

  /**
   * @param credentials - `accessToken` is the Bearer token. The store slug
   *   is read from `credentials.extra.slug`.
   * @param slugOverride - Optional constructor-level slug (for server-level
   *   config). Per-connection credentials take precedence.
   */
  constructor(credentials: Credentials, slugOverride?: string) {
    const slug =
      (credentials.extra?.['slug'] as string | undefined) ??
      slugOverride ??
      ''
    if (!slug) {
      throw new Error(
        'CartpandaClient: store slug is required. ' +
          'Supply it via credentials.extra.slug or CartpandaAdapterConfig.slug.',
      )
    }
    this.slug = slug
    this.http = axios.create({
      baseURL: `${API_BASE}/${slug}`,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Page-based list helper. CartPanda wraps list responses in a top-level
   * envelope keyed by `resourceKey` (e.g. `products`, `orders`). Pagination
   * is carried via `page` / `per_page` query params; a `meta.pagination`
   * block in the response indicates whether more pages exist.
   */
  async listWithPage<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      (extraParams['per_page'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['per_page'] = perPage
    params['page'] = page

    const res = await this.get<Record<string, unknown>>(path, params)

    // CartPanda response shape: { products: [...], meta: { pagination: { current_page, total_pages, ... } } }
    const items = (res[resourceKey] ?? []) as T[]
    const meta = res['meta'] as
      | { pagination?: { current_page?: number; total_pages?: number } }
      | undefined
    const totalPages = meta?.pagination?.total_pages ?? 1
    const currentPage = meta?.pagination?.current_page ?? page
    const nextPage = currentPage < totalPages ? currentPage + 1 : undefined

    return { items, nextPage }
  }

  /** The store slug (for diagnostic purposes). */
  get storeSlug(): string {
    return this.slug
  }
}
