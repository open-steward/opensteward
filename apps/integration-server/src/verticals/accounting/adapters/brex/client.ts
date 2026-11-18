/**
 * Brex REST API client.
 *
 * Base URL: https://platform.brexapis.com
 * Auth:     Authorization: Bearer <access_token>
 * Pagination: cursor-based — response includes `next_cursor`; pass as `cursor` query param.
 *
 * Docs: https://developer.brex.com/
 */

import axios, { type AxiosInstance } from 'axios'
import { BREX_API_BASE, DEFAULT_PAGE_SIZE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface BrexPage<T> {
  items: T[]
  next_cursor?: string | null
  /** GET /v3/accounting/records only: "Whether there are more results available". */
  has_next_page?: boolean
  /** GET /v3/accounting/records only: "Total count of records matching the query". */
  total_count?: number | null
}

export class BrexClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: BREX_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  /**
   * Fetch a single page from a cursor-paginated endpoint.
   *
   * @param path   - API path, e.g. '/v2/accounts/cash'
   * @param limit  - items per page (each endpoint's documented maximum is in constants.ts)
   * @param cursor - pagination cursor from a previous response's next_cursor
   * @param extra  - additional query params
   */
  async listPage<T>(
    path: string,
    limit: number = DEFAULT_PAGE_SIZE,
    cursor?: string,
    extra?: Record<string, unknown>,
  ): Promise<BrexPage<T>> {
    const params: Record<string, unknown> = { limit, ...extra }
    if (cursor) params['cursor'] = cursor
    return this.get<BrexPage<T>>(path, params)
  }
}
