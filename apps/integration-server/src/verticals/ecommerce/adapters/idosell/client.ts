/**
 * IdoSell Admin REST API (v8) client.
 *
 * Auth: `X-API-KEY` header (see `./connect-form.ts`). IdoSell also accepts
 * `Authorization: Bearer` (OAuth) per every endpoint's OpenAPI security
 * block, but this adapter is API-key only.
 *
 * IdoSell's own pagination envelope is NOT uniform across endpoints —
 * confirmed against the raw OpenAPI fragments embedded in the reference
 * pages, not just their rendered summaries:
 *   - `GET /products/categories`, `GET /clients/clients`, `GET /returns/returns`,
 *     `POST /products/products/search` respond with lowercase
 *     `results` + `resultsNumberAll` / `resultsNumberPage` / `resultsPage` / `resultsLimit`.
 *   - `GET /orders/orders`, `POST /orders/orders/search` respond with a
 *     capitalised `Results` array and only `resultsNumberAll` — no page-count
 *     fields at all.
 * `listSearch` takes the results key as a parameter so each call site states
 * which shape it expects instead of guessing.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_VERSION } from './constants'

export interface IdosellListEnvelope<T> {
  items: T[]
  /** Total rows matching the query, when the platform reported one. */
  totalCount?: number
  /** Zero-indexed page the platform believes it served, when known. */
  currentPage?: number
  /** Requested page size, echoed back when known. */
  limit?: number
}

export class IdosellClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey =
      (credentials.extra?.['apiKey'] as string | undefined) ?? credentials.accessToken
    const shopDomain = credentials.extra?.['shopDomain'] as string | undefined

    if (!apiKey) {
      throw new Error('IdosellClient: credentials.extra.apiKey (or accessToken) is required')
    }
    if (!shopDomain) {
      throw new Error(
        'IdosellClient: credentials.extra.shopDomain is required (e.g. clientXXX.idosell.com)',
      )
    }

    this.http = axios.create({
      baseURL: `https://${shopDomain}/api/admin/${API_VERSION}`,
      headers: {
        'X-API-KEY': apiKey,
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

  /** Only `DELETE /clients/remove` uses the HTTP DELETE verb in this adapter. */
  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }

  /**
   * GET with `resultsPage`/`resultsLimit` query params, for the endpoints
   * that page via querystring rather than a POST body (`/products/categories`,
   * `/clients/clients`, `/returns/returns`).
   */
  async listGet<T>(
    path: string,
    params: Record<string, unknown>,
    resultsPage: number,
    resultsLimit: number,
    resultsField = 'results',
  ): Promise<IdosellListEnvelope<T>> {
    const data = await this.get<Record<string, unknown>>(path, {
      ...params,
      resultsPage,
      resultsLimit,
    })
    const items = (data[resultsField] as T[] | undefined) ?? []
    const totalCount = data['resultsNumberAll'] as number | undefined
    const currentPage = (data['resultsPage'] as number | undefined) ?? resultsPage
    const limit = (data['resultsLimit'] as number | undefined) ?? resultsLimit
    return { items, totalCount, currentPage, limit }
  }

  /**
   * POST a `{ params: { ...body, resultsPage, resultsLimit } }` search
   * request and normalise whichever of the two response envelope shapes
   * documented above comes back.
   *
   * @param resultsField `'results'` (lowercase, most endpoints) or
   *   `'Results'` (orders — see class doc).
   */
  async listSearch<T>(
    path: string,
    body: Record<string, unknown>,
    resultsPage: number,
    resultsLimit: number,
    resultsField: 'results' | 'Results' = 'results',
  ): Promise<IdosellListEnvelope<T>> {
    const data = await this.post<Record<string, unknown>>(path, {
      params: { ...body, resultsPage, resultsLimit },
    })
    const items = (data[resultsField] as T[] | undefined) ?? []
    const totalCount = data['resultsNumberAll'] as number | undefined
    const currentPage = (data['resultsPage'] as number | undefined) ?? resultsPage
    const limit = (data['resultsLimit'] as number | undefined) ?? resultsLimit
    return { items, totalCount, currentPage, limit }
  }
}
