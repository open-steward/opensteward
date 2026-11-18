/**
 * PlentyONE REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <access_token>` header for every request.
 *  - Page-based pagination: `page` (1-based) + `itemsPerPage` query params.
 *    Response envelope: { page, totalsCount, isLastPage, lastPageNumber, entries[] }.
 *  - 429 / 5xx retry with exponential backoff via the shared `withRetry` helper.
 *
 * The per-system base URL is derived from `credentials.extra.plentyId`:
 *   https://p{plentyId}.my.plentysystems.com/rest
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildBaseUrl } from './auth'

/** Standard PlentyONE page-based list response envelope. */
export interface PlentyPageResponse<T> {
  page: number
  totalsCount: number
  isLastPage: boolean
  lastPageNumber: number
  entries: T[]
}

export interface ListResult<T> {
  items: T[]
  /** Next page number, undefined when on the last page. */
  nextPage?: number
  totalsCount?: number
}

export class PlentyOneClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const plentyId = credentials.extra?.['plentyId'] as string | undefined
    if (!plentyId) {
      throw new Error(
        'PlentyOneClient: credentials.extra.plentyId is required ' +
          '(the numeric system id from the PlentyONE URL, e.g. "54321" for p54321.my.plentysystems.com)',
      )
    }

    this.http = axios.create({
      baseURL: buildBaseUrl(plentyId),
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
   * Page-based list helper for PlentyONE's standard collection endpoints.
   *
   * PlentyONE returns results in an `entries` array inside a pagination
   * envelope. Pass `extraParams` for any additional filters (e.g.
   * `{ updatedAtFrom: '...', typeId: 1 }`).
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const itemsPerPage = Math.min(
      (extraParams['itemsPerPage'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['itemsPerPage'] = itemsPerPage
    params['page'] = page

    const res = await this.get<PlentyPageResponse<T>>(path, params)
    const entries = res.entries ?? []
    const nextPage = res.isLastPage ? undefined : (res.page ?? page) + 1

    return {
      items: entries,
      nextPage,
      totalsCount: res.totalsCount,
    }
  }
}
