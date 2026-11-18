/**
 * Mirakl Marketplace Platform REST API client.
 *
 * Features:
 *  - API-key auth: the seller's API key is sent directly in the
 *    `Authorization` header (no "Bearer" prefix — Mirakl's documented
 *    scheme for the seller/shop API).
 *  - Retries with exponential backoff on 429 and 5xx, mirroring the
 *    other platform clients in this adapter suite.
 *  - `listWithToken` helper that follows Mirakl's token-based pagination:
 *    each response may include `next_page_token`; callers pass it back as
 *    `page_token` on the next request.
 *
 * Per-connection credentials shape:
 *   credentials.accessToken       — seller API key
 *   credentials.extra.baseUrl     — operator instance base URL
 *                                   (e.g. https://your-store.mirakl.net)
 *
 * Docs: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

/**
 * Result returned by `listWithToken`. `nextPageToken` is undefined when
 * the last page has been reached.
 */
export interface ListResult<T> {
  items: T[]
  nextPageToken?: string
  totalItems?: number
}

export class MiraklClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const baseUrl = credentials.extra?.['baseUrl'] as string | undefined

    if (!apiKey) {
      throw new Error('MiraklClient: credentials.accessToken (API key) is required')
    }
    if (!baseUrl) {
      throw new Error(
        'MiraklClient: credentials.extra.baseUrl is required ' +
          '(e.g. https://your-operator.mirakl.net)',
      )
    }

    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      headers: {
        // Mirakl: API key sent directly in Authorization, no scheme prefix.
        Authorization: apiKey,
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

  /**
   * Generic token-paginated list helper.
   *
   * Mirakl pagination model:
   *   - First request: `?limit=<n>[&<filters>]`
   *   - Subsequent:    `?page_token=<token>` (other params ignored by the API)
   *   - Response body:  `{ [dataKey]: T[], next_page_token?: string, total_count?: number }`
   *
   * @param path      API path (e.g. `/api/orders`)
   * @param dataKey   Top-level response key holding the array (e.g. `"orders"`)
   * @param params    Extra query params for the first request; `page_token` overrides all
   */
  async listWithToken<T>(
    path: string,
    dataKey: string,
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (params['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const merged: Record<string, unknown> = { ...params, limit }

    const raw = await this.get<Record<string, unknown>>(path, merged)
    const items = (raw[dataKey] ?? []) as T[]
    const nextPageToken = raw['next_page_token'] as string | undefined
    const totalItems = raw['total_count'] as number | undefined

    return { items, nextPageToken, totalItems }
  }
}
