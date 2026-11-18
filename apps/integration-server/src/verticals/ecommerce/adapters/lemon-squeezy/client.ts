/**
 * Lemon Squeezy REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <api_key>` auth header.
 *  - `Accept: application/vnd.api+json` as required by the JSON:API spec.
 *  - Simple 429 / 5xx retry with exponential backoff.
 *  - `listWithPage` helper that reads the JSON:API pagination meta to return
 *    the next page number so callers can iterate deterministically.
 *
 * Response envelope (JSON:API):
 *   { data: { id, type, attributes, relationships }, meta: { page: { ... } }, links: { ... } }
 *   or for collections:
 *   { data: [ ... ], meta: { page: { currentPage, lastPage, perPage, total } }, links: { ... } }
 *
 * Docs: https://docs.lemonsqueezy.com/api/getting-started/requests
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
 * JSON:API resource object returned by Lemon Squeezy for a single resource.
 */
export interface LsResource<A extends Record<string, unknown>> {
  id: string
  type: string
  attributes: A
  relationships?: Record<string, unknown>
}

/**
 * JSON:API response envelope for a single resource.
 */
export interface LsSingleResponse<A extends Record<string, unknown>> {
  data: LsResource<A>
}

/**
 * JSON:API response envelope for a list of resources with pagination meta.
 */
export interface LsListResponse<A extends Record<string, unknown>> {
  data: LsResource<A>[]
  meta: {
    page: {
      currentPage: number
      from: number
      lastPage: number
      perPage: number
      to: number
      total: number
    }
  }
  links: {
    first?: string
    last?: string
    next?: string | null
    prev?: string | null
  }
}

export interface ListResult<A extends Record<string, unknown>> {
  items: LsResource<A>[]
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

export class LemonSqueezyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${BASE_URL}/${API_VERSION}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
      timeout: 30_000,
    })
  }

  async getSingle<A extends Record<string, unknown>>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<LsResource<A>> {
    return withRetry(async () => {
      const { data } = await this.http.get<LsSingleResponse<A>>(path, { params })
      return data.data
    })
  }

  async post<A extends Record<string, unknown>>(
    path: string,
    body?: unknown,
  ): Promise<LsResource<A>> {
    return withRetry(async () => {
      const { data } = await this.http.post<LsSingleResponse<A>>(path, body)
      return data.data
    })
  }

  async patch<A extends Record<string, unknown>>(
    path: string,
    body?: unknown,
  ): Promise<LsResource<A>> {
    return withRetry(async () => {
      const { data } = await this.http.patch<LsSingleResponse<A>>(path, body)
      return data.data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper that follows Lemon Squeezy's page-based pagination.
   * Uses `page[number]` and `page[size]` query params.
   * Returns items (raw JSON:API resource objects) and the next page number.
   */
  async listWithPage<A extends Record<string, unknown>>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<A>> {
    const perPage = Math.min(
      (extraParams['page[size]'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page[number]'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    // Remove our internal synonym
    delete params['limit']
    params['page[size]'] = perPage
    params['page[number]'] = page

    const res = await withRetry(async () => {
      const { data } = await this.http.get<LsListResponse<A>>(path, { params })
      return data
    })

    const meta = res.meta?.page
    const nextPage = meta && meta.currentPage < meta.lastPage ? meta.currentPage + 1 : undefined

    return {
      items: res.data ?? [],
      nextPage,
      totalPages: meta?.lastPage,
      totalItems: meta?.total,
    }
  }
}
