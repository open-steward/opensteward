/**
 * NHN Commerce (Godomall / Shopby) Shop API client.
 *
 * Features:
 *  - Three required headers on every request: `Version`, `clientId`, `platform`.
 *  - Member-scoped endpoints additionally require an `accessToken` header
 *    (the short-lived bearer token from POST /oauth/token).
 *  - Page-number based pagination: responses include `totalCount` and `pageCount`.
 *    The adapter uses `pageNumber` / `pageSize` query parameters.
 *
 * Docs: https://docs.shopby.co.kr
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, API_VERSION, DEFAULT_PLATFORM, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

export interface ListResult<T> {
  items: T[]
  /** 1-based page number that was fetched. */
  pageNumber: number
  /** Total number of matching records (may be 0 if API did not include it). */
  totalCount: number
}

function resolveClientId(credentials: Credentials): string {
  const extra = credentials.extra as Record<string, unknown> | undefined
  return (extra?.['clientId'] as string | undefined) ?? ''
}

export class NhnCommerceClient {
  private http: AxiosInstance
  private clientId: string

  constructor(credentials: Credentials, clientId?: string) {
    // clientId can be provided at construction time (from adapter config) or
    // read from credentials.extra (stored at token-exchange time).
    this.clientId = clientId ?? resolveClientId(credentials)
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Version: API_VERSION,
        clientId: this.clientId,
        platform: DEFAULT_PLATFORM,
        // Member access token — required by most endpoints.
        accessToken: credentials.accessToken,
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
   * Page-based list helper for Shopby endpoints that return
   * `{ items: T[], totalCount: number }`.
   *
   * @param path        API path, e.g. `/products/search`
   * @param extraParams Extra query parameters (e.g. filters, sort)
   * @param pageNumber  1-based page number (default 1)
   * @param pageSize    Results per page (default DEFAULT_PAGE_SIZE, max MAX_PAGE_SIZE)
   */
  async listPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
    pageNumber = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<ListResult<T>> {
    const size = Math.min(pageSize, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      ...extraParams,
      pageNumber,
      pageSize: size,
      hasTotalCount: true,
    }
    const res = await this.get<{ items?: T[]; totalCount?: number }>(path, params)
    return {
      items: res.items ?? [],
      pageNumber,
      totalCount: res.totalCount ?? 0,
    }
  }
}
