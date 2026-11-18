/**
 * Spendesk API HTTP client.
 *
 * Paging differs by endpoint:
 *   - settlements, suppliers, users: `page` + `pageSize` query params
 *     (https://developer.spendesk.com/reference/pagination).
 *   - payables: POST /v1/payables/search, body `limit` + `cursor`, the next
 *     page's cursor returned as `nextCursor`.
 *   - accounts: GET /v1/experimental/accounts, `offset` + `fetch`, with
 *     `totalResults` in the response.
 *
 * Bearer token goes in the Authorization header.
 */

import axios, { type AxiosInstance } from 'axios'
import { SPENDESK_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** Page/pageSize list envelope */
export interface SpendeskList<T> {
  data: T[]
}

export class SpendeskClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SPENDESK_API_BASE,
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

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  /**
   * Fetch one page of an offset-paginated endpoint (page + pageSize).
   */
  async getPage<T>(
    path: string,
    page: number,
    pageSize: number,
    extraParams?: Record<string, unknown>,
  ): Promise<SpendeskList<T>> {
    return this.get<SpendeskList<T>>(path, { page, pageSize, ...extraParams })
  }
}
