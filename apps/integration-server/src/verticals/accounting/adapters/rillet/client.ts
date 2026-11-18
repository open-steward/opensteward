/**
 * Rillet REST API client.
 *
 * Authentication: Bearer token (API key) in the Authorization header.
 * Versioning: X-Rillet-API-Version header, v4 (see RILLET_API_VERSION).
 * Pagination: keyset-based via `cursor` + `limit` query params;
 *   next page cursor returned in `pagination.next_cursor`.
 *
 * Docs: https://docs.api.rillet.com/docs/getting-started.md
 */

import axios, { type AxiosInstance } from 'axios'
import { RILLET_API_BASE, RILLET_API_VERSION } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface RilletPagination {
  next_cursor?: string
}

/** One page of a cursor-paged list, as the adapter's pagers want it. */
export interface RilletPage<T> {
  items: T[]
  /** `pagination.next_cursor`; absent on the last page. */
  next?: string
}

export class RilletClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${RILLET_API_BASE}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Rillet-API-Version': RILLET_API_VERSION,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * One page of a list: its rows under `key`, and the cursor that starts the
   * next page. "Subsequent calls will also return a next cursor or no cursor
   * if this is the last page"
   * (https://docs.api.rillet.com/docs/getting-started.md).
   *
   * Every Rillet list names its rows after the resource (`invoices`, `bills`,
   * `customers`, `journal_entries`, `tax_rates`, …); no v4.0 list response
   * has a `data` key, so reading one returned nothing against the real API.
   * A missing `pagination` object, or an empty `next_cursor`, is the end.
   *
   * A `next_cursor` equal to the `cursor` just sent names this page as the
   * next one, so following it would serve this page forever. That throws
   * here, for every caller: the contact stream's positions are objects,
   * which the row pager's own check (by identity) cannot see repeat.
   */
  async listPage<T>(
    path: string,
    key: string,
    params: Record<string, unknown>,
  ): Promise<RilletPage<T>> {
    const res = await this.get<Record<string, unknown> | undefined>(path, params)
    const rows = res?.[key]
    const raw = (res?.['pagination'] as RilletPagination | undefined)?.next_cursor
    const next = typeof raw === 'string' && raw !== '' ? raw : undefined
    if (next !== undefined && next === params['cursor'])
      throw new Error(
        `Rillet ${path}: pagination.next_cursor repeats the cursor it was sent; following it would loop`,
      )
    return {
      items: Array.isArray(rows) ? (rows as T[]) : [],
      ...(next !== undefined ? { next } : {}),
    }
  }

  /**
   * Every row of a list whose v4.0 page documents no paging (GET /accounts,
   * GET /tax-rates: no `limit`, no `cursor`, a 200 body of rows alone).
   *
   * Getting started says otherwise: "The Rillet API supports keyset based
   * pagination for all GET endpoints that return lists of objects ... each
   * response includes a pagination object with the cursor needed to access
   * the next page". So a `next_cursor` is followed when one comes back, with
   * the same params, and none is invented when it does not: as documented
   * per endpoint that is one request; if the live API pages anyway, no row
   * is dropped and the list is not reported complete at its first page.
   * No `limit` is sent, since neither endpoint documents one. A cursor that
   * comes round again throws rather than looping.
   */
  async listAll<T>(path: string, key: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const rows: T[] = []
    const followed = new Set<string>()
    let cursor: string | undefined
    for (;;) {
      const page = await this.listPage<T>(
        path,
        key,
        cursor === undefined ? params : { ...params, cursor },
      )
      rows.push(...page.items)
      if (page.next === undefined) return rows
      if (followed.has(page.next))
        throw new Error(
          `Rillet ${path}: pagination.next_cursor names a page already read; following it would loop`,
        )
      followed.add(page.next)
      cursor = page.next
    }
  }
}
