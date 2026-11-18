/**
 * Yo!Kart App API client.
 *
 * Features:
 *  - `api_key` query-parameter authentication (store-admin-generated key).
 *  - Response envelope unwrapping: Yo!Kart wraps all responses in
 *    `{ status, responseCode, msg, data }`. A `status` value other than
 *    "1" or a `responseCode` other than "200" is treated as an API error.
 *  - Page-based pagination: the data envelope includes `page`, `pageSize`,
 *    `pageCount`, and `recordCount` fields.
 *  - Retries with exponential backoff on 429 and 5xx.
 *
 * Base URL format: https://{store-domain}/app-api/{version}/
 *
 * Docs: https://www.yo-kart.com/resource-center.html (API Document V2.3)
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

// ── Yo!Kart response envelope ─────────────────────────────────────────────────

export interface YokartEnvelope<T = unknown> {
  status: string | number
  responseCode: string | number
  msg: string
  data: T
}

// ── Retry helper ──────────────────────────────────────────────────────────────

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

// ── Pagination result ─────────────────────────────────────────────────────────

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

// ── Yo!Kart paginated data envelope ──────────────────────────────────────────

export interface YokartPagedData {
  /** The array key varies by endpoint; the adapter passes the key name. */
  [key: string]: unknown
  page?: string | number
  pageSize?: string | number
  pageCount?: string | number
  recordCount?: string | number
}

// ── Client ────────────────────────────────────────────────────────────────────

export class YokartClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    const site = credentials.extra?.['site'] as string | undefined
    if (!site) {
      throw new Error(
        'YokartClient: credentials.extra.site is required (e.g. https://shop.example.com)',
      )
    }

    this.apiKey = credentials.accessToken
    const baseURL = `${site.replace(/\/$/, '')}/app-api/${API_VERSION}`

    this.http = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Merge `api_key` into query params for every request. Yo!Kart uses the
   * `api_key` query parameter on all authenticated endpoints.
   */
  private authParams(): Record<string, string> {
    return { api_key: this.apiKey }
  }

  /**
   * Unwrap the Yo!Kart response envelope. Throws if the API signals an
   * error via `status !== "1"` or `responseCode !== "200"`.
   */
  private unwrap<T>(envelope: YokartEnvelope<T>): T {
    const ok =
      String(envelope.status) === '1' || String(envelope.responseCode) === '200'
    if (!ok) {
      throw new Error(
        `Yo!Kart API error (${envelope.responseCode}): ${envelope.msg}`,
      )
    }
    return envelope.data
  }

  async get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<YokartEnvelope<T>>(path, {
        params: { ...this.authParams(), ...params },
      })
      return this.unwrap(data)
    })
  }

  async post<T>(path: string, body?: unknown, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<YokartEnvelope<T>>(path, body, {
        params: { ...this.authParams(), ...params },
      })
      return this.unwrap(data)
    })
  }

  async put<T>(path: string, body?: unknown, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<YokartEnvelope<T>>(path, body, {
        params: { ...this.authParams(), ...params },
      })
      return this.unwrap(data)
    })
  }

  async delete(path: string, params: Record<string, unknown> = {}): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params: { ...this.authParams(), ...params },
      })
    })
  }

  /**
   * Page-based list helper.  Yo!Kart embeds pagination metadata inside the
   * `data` envelope alongside the resource array (e.g.
   * `data.products`, `data.page`, `data.pageCount`).
   *
   * @param path         API path (relative to base URL).
   * @param resourceKey  Key of the array inside `data` (e.g. `'products'`).
   * @param extraParams  Additional query parameters (page, pageSize, etc.).
   */
  async listWithPage<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams['pageSize'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['pageSize'] = pageSize
    params['page'] = page

    const raw = await this.get<YokartPagedData>(path, params)
    const items = (raw[resourceKey] as T[] | undefined) ?? []
    const pageCount =
      raw['pageCount'] != null ? parseInt(String(raw['pageCount']), 10) : undefined
    const currentPage =
      raw['page'] != null ? parseInt(String(raw['page']), 10) : page
    const totalItems =
      raw['recordCount'] != null ? parseInt(String(raw['recordCount']), 10) : undefined

    const hasNextPage =
      pageCount != null && !Number.isNaN(pageCount) && currentPage < pageCount

    return {
      items,
      nextPage: hasNextPage ? currentPage + 1 : undefined,
      totalPages: pageCount,
      totalItems,
    }
  }
}
