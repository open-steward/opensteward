/**
 * Squarespace Commerce API client.
 *
 * Features:
 *  - Bearer token auth via API key.
 *  - Simple 429 retry with exponential backoff.
 *  - Cursor-based pagination using `pagination.nextPageCursor`.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/overview
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'
import { withRetry } from '@opensteward/shared'

export class SquarespaceClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'OpenSteward/squarespace-adapter',
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
   * One upstream page of a Squarespace cursor list, sending exactly
   * `query` and nothing else.
   *
   * The orders, inventory, transactions, products and profiles lists
   * document no page-size parameter: each returns "up to 50" items a page, and the next page is
   * fetched with `cursor` = `pagination.nextPageCursor`. `next` is that
   * cursor, or undefined when `pagination.hasNextPage` is false or the
   * cursor is absent or empty.
   */
  async cursorPage<T>(
    path: string,
    resourceKey: string,
    query: Record<string, unknown>,
  ): Promise<{ items: T[]; next: string | undefined }> {
    const data = await this.get<Record<string, unknown>>(path, query)
    const items = (data[resourceKey] ?? []) as T[]
    const pagination = data['pagination'] as
      { hasNextPage?: boolean; nextPageCursor?: string | null } | undefined
    const cursor = pagination?.nextPageCursor
    const next =
      pagination?.hasNextPage !== false && typeof cursor === 'string' && cursor !== ''
        ? cursor
        : undefined
    return { items, next }
  }
}
