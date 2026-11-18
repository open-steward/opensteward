/**
 * Volusion REST API client.
 *
 * Features:
 *  - Bearer token OR API-key query-param auth (auto-detect from credentials).
 *  - Simple 429 retry with exponential backoff.
 *  - Offset-based pagination via `pageNumber` / `pageSize` params.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

export interface ListResult<T> {
  items: T[]
}

export class VolusionClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    const params: Record<string, string> = {}

    if (credentials.accessToken) {
      headers['Authorization'] = `Bearer ${credentials.accessToken}`
    } else if ((credentials as Record<string, unknown>)['apiKey']) {
      params['apikey'] = (credentials as Record<string, unknown>)['apiKey'] as string
    }

    this.http = axios.create({
      baseURL: baseUrl ?? DEFAULT_BASE_URL,
      headers,
      params,
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
   * Offset-based list helper. Volusion returns arrays directly (no wrapper
   * envelope). Page numbering starts at 1.
   */
  async list<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams.pageSize as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const pageNumber = (extraParams.pageNumber as number) ?? 1
    const params: Record<string, unknown> = {
      ...extraParams,
      pageSize,
      pageNumber,
    }
    const items = await this.get<T[]>(path, params)
    return { items: Array.isArray(items) ? items : [] }
  }
}
