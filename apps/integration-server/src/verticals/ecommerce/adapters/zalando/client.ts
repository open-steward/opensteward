/**
 * Zalando zDirect API HTTP client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` header on every request.
 *  - Scroll/cursor-based pagination via `scroll_token` response field.
 *  - 429 + 5xx retry with exponential back-off via the shared `withRetry`
 *    helper.
 *
 * Zalando wraps list responses in `{ items: [...], scroll_token?: string }`.
 * The `listWithScroll` helper handles pagination transparently.
 *
 * Docs: https://developers.merchants.zalando.com/docs/api-overview.html
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { PROD_BASE_URL, SANDBOX_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  /** Opaque scroll token for the next page, if any. */
  nextCursor?: string
}

/** Zalando list-response envelope. */
interface ZalandoListEnvelope<T> {
  items?: T[]
  content?: T[]
  scroll_token?: string
  next?: string
}

export class ZalandoClient {
  private http: AxiosInstance

  constructor(
    credentials: Credentials,
    sandbox = false,
  ) {
    const baseURL = sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL
    this.http = axios.create({
      baseURL,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  /**
   * Fetch a paginated resource list.
   *
   * Zalando uses an opaque `scroll_token` cursor in the response envelope.
   * Pass `scroll_token` as a query param to fetch the next page.
   * The response envelope may use `items` or `content` as the array key.
   */
  async listWithScroll<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams.limit as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const params: Record<string, unknown> = {
      ...extraParams,
      limit: pageSize,
    }

    const data = await this.get<ZalandoListEnvelope<T>>(path, params)
    const items = (data.items ?? data.content ?? []) as T[]
    const nextCursor = data.scroll_token ?? data.next ?? undefined

    return { items, nextCursor }
  }
}
