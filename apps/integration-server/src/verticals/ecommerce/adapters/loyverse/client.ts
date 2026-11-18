/**
 * Loyverse REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` auth header.
 *  - Exponential backoff retry on 429 and 5xx responses.
 *  - `listWithCursor` helper that reads the `cursor` field from list response
 *    bodies — Loyverse uses body-level cursors (not Link headers).
 *
 * Base URL: https://api.loyverse.com/v1.0
 *
 * Pagination: pass `cursor` as a query parameter to fetch the next page.
 * The response includes a `cursor` string when more pages exist, or null/absent
 * when the last page has been reached.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

export interface ListResult<T> {
  items: T[]
  /** Opaque cursor for the next page, or undefined when no more pages. */
  nextCursor?: string
}

/** Shape that Loyverse wraps list responses in: `{ <resourceKey>: T[], cursor: string | null }` */
interface LoyverseListResponse<T> {
  [key: string]: T[] | string | null | undefined
  cursor?: string | null
}

export class LoyverseClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
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
   * List helper that follows Loyverse's cursor-based pagination.
   *
   * Loyverse returns `{ <resourceKey>: [...], cursor: "<opaque>" | null }`.
   * Pass the returned `nextCursor` as `params.cursor` in the next call to
   * advance to the next page.
   */
  async listWithCursor<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    // The clamp goes after the spread: spread last, a caller's raw `limit`
    // (the sync worker's 500) overwrote it and went upstream past the
    // documented maximum of 250.
    const params: Record<string, unknown> = {
      ...extraParams,
      limit: Math.min(
        (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      ),
    }

    const res = await this.get<LoyverseListResponse<T>>(path, params)
    const items = (res[resourceKey] as T[] | undefined) ?? []
    const nextCursor = res.cursor ?? undefined

    return { items, nextCursor }
  }
}
