/**
 * Jumpseller REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <access_token>` header.
 *  - Simple 429/5xx retry with exponential backoff.
 *  - `listWithPage` helper that follows Jumpseller's page-based pagination.
 *    Jumpseller uses `?page=N&limit=M` query params; there is no Link header
 *    cursor — callers iterate by incrementing `page` while the page is full.
 *
 * Jumpseller API base URL: https://api.jumpseller.com/v1
 * All endpoints are suffixed with `.json`.
 *
 * Docs: https://jumpseller.com/support/api/
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  /** The next page number, or undefined if this is the last page. */
  nextPage?: number
}

export class JumpsellerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
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
   * List helper that follows Jumpseller's page-based pagination.
   *
   * Jumpseller returns a JSON array (no envelope). If the returned page
   * contains fewer items than `limit`, it is the last page.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams, limit, page }
    // Remove our canonical aliases so they don't leak as extra params.
    delete params['cursor']

    const data = await this.get<T[]>(path, params)
    const items = data ?? []

    // If we got a full page, there may be a next page.
    const nextPage = items.length >= limit ? page + 1 : undefined

    return { items, nextPage }
  }
}
