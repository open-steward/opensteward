/**
 * SendOwl REST API client.
 *
 * Docs: https://dashboard.sendowl.com/developers/api/introduction
 *
 * Features:
 *  - HTTP Basic auth: API key as username, API secret as password.
 *  - `Accept`/`Content-Type: application/json` — SendOwl defaults to XML,
 *    JSON is opt-in via these headers.
 *  - Retries via the shared `withRetry` (429 only, exponential backoff);
 *    the docs ask for no more than ~1 request/second.
 *  - `listWithPage` follows SendOwl's `page` + `per_page` pagination and
 *    unwraps each array element from its per-resource singular wrapper key
 *    (SendOwl wraps every list item as `{ "<key>": {...} }`, confirmed on
 *    both the products and discounts reference pages).
 */
import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { withRetry } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { API_HOST, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  /** True only when a full page was returned — SendOwl reports no total. */
  hasMore: boolean
}

export class SendOwlClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const apiSecret = credentials.extra?.['apiSecret'] as string | undefined

    if (!apiKey) {
      throw new Error('SendOwlClient: credentials.accessToken (apiKey) is required')
    }
    if (!apiSecret) {
      throw new Error('SendOwlClient: credentials.extra.apiSecret is required')
    }

    const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    this.http = axios.create({
      baseURL: API_HOST,
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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

  async getRaw<T>(path: string, params?: Record<string, unknown>): Promise<AxiosResponse<T>> {
    return withRetry(() => this.http.get<T>(path, { params }))
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

  async delete<T = void>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }

  /**
   * List helper for SendOwl's `page`/`per_page` pagination.
   *
   * `hasMore` is inferred from whether a full page came back (SendOwl
   * reports no total-count header or field), matching the convention
   * already used by this vertical's nopCommerce adapter for the same gap.
   */
  async listWithPage<T>(
    path: string,
    wrapperKey: string,
    extraParams: Record<string, unknown>,
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      (extraParams['per_page'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1
    const params: Record<string, unknown> = { ...extraParams, per_page: perPage, page }

    const raw = await this.get<Array<Record<string, unknown>>>(path, params)
    const items = (raw ?? []).map((wrapped) => wrapped[wrapperKey] as T)
    return { items, hasMore: items.length >= perPage }
  }
}
