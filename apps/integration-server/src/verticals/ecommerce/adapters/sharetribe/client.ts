/**
 * Sharetribe Flex Integration API HTTP client.
 *
 * Features:
 *  - `Authorization: bearer <token>` auth header (Sharetribe spells it lowercase "bearer").
 *  - Page-based pagination (`page` + `perPage` params; `meta.totalPages` in response).
 *  - 429 retry with exponential backoff via the shared `withRetry` helper.
 *
 * All Integration API responses share the envelope:
 *   { data: T | T[], meta?: { page, perPage, totalItems, totalPages }, included?: [] }
 *
 * Docs: https://www.sharetribe.com/api-reference/integration.html
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, INTEGRATION_API_BASE_URL, MAX_PAGE_SIZE } from './constants'

export interface SharetribeMeta {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

/** Envelope returned by list (query) endpoints. */
export interface SharetribeListResponse<T> {
  data: T[]
  meta: SharetribeMeta
  included?: unknown[]
}

/** Envelope returned by single-resource (show) endpoints. */
export interface SharetribeSingleResponse<T> {
  data: T
  included?: unknown[]
}

export interface ListResult<T> {
  items: T[]
  /** Page number of the next page, or undefined if on the last page. */
  nextPage?: number
  totalPages: number
}

export class SharetribeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: INTEGRATION_API_BASE_URL,
      headers: {
        // Sharetribe uses lowercase "bearer" (not "Bearer")
        Authorization: `bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** GET a single resource. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<SharetribeSingleResponse<T>>(path, { params })
      return data.data
    })
  }

  /** GET a list of resources (one page). */
  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    return withRetry(async () => {
      const perPage = Math.min(
        (params.perPage as number | undefined) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      )
      const { data } = await this.http.get<SharetribeListResponse<T>>(path, {
        params: { ...params, perPage },
      })
      const meta = data.meta
      const nextPage =
        meta && meta.page < meta.totalPages ? meta.page + 1 : undefined
      return {
        items: data.data ?? [],
        nextPage,
        totalPages: meta?.totalPages ?? 1,
      }
    })
  }

  /** POST a command (create, update, transition …). */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<SharetribeSingleResponse<T>>(path, body)
      return data.data
    })
  }
}
