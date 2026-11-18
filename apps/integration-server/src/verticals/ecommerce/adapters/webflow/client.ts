/**
 * Webflow REST API client.
 *
 * Features:
 *  - `Authorization: Bearer` auth header.
 *  - Simple 429 retry with exponential backoff.
 *  - `listWithPagination` helper that reads Webflow's offset-based pagination
 *    (`offset` + `limit` + `total`).
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

export interface ListResult<T> {
  items: T[]
  total?: number
  offset?: number
}

export class WebflowClient {
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper that handles Webflow's offset-based pagination. Webflow wraps
   * list responses in `{ items: [...], count, limit, offset, total }`.
   */
  async listWithPagination<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams.limit as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams.offset as number) ?? 0
    const params: Record<string, unknown> = {
      ...extraParams,
      limit,
      offset,
    }

    const data = await this.get<Record<string, unknown>>(path, params)
    return {
      items: ((data[resourceKey] ?? data['items'] ?? []) as T[]),
      total: data['total'] as number | undefined,
      offset: (data['offset'] as number | undefined) ?? offset,
    }
  }
}
