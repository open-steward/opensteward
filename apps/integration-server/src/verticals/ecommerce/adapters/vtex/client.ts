/**
 * VTEX REST API client.
 *
 * Features:
 *  - Auth headers `X-VTEX-API-AppKey` / `X-VTEX-API-AppToken` on every request.
 *  - Base URL built from `accountName` + `environment` (default: `vtexcommercestable`).
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listOrders` helper that reads VTEX's page/per_page pagination from the OMS API.
 *  - `searchMasterData` helper for Master Data v2 (CL entity) using REST-Range header.
 *
 * VTEX money values are already in integer minor units (centavos/cents), so they
 * map directly to canonical Money.amount without conversion.
 *
 * Docs:
 *   Orders:      https://developers.vtex.com/docs/api-reference/orders-api
 *   Catalog:     https://developers.vtex.com/docs/api-reference/catalog-api
 *   MasterData:  https://developers.vtex.com/docs/api-reference/master-data-api-v2
 */

import axios, { type AxiosInstance, type AxiosError, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MD_MAX_PAGE_SIZE } from './constants'

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

export interface PagedResult<T> {
  items: T[]
  total?: number
  page?: number
  perPage?: number
}

export class VtexClient {
  private http: AxiosInstance
  /** Base URL: https://{account}.{env}.com.br */
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const appKey = credentials.extra?.['appKey'] as string | undefined
    const appToken = credentials.accessToken
    const accountName = credentials.extra?.['accountName'] as string | undefined
    const environment =
      (credentials.extra?.['environment'] as string | undefined) ?? DEFAULT_ENVIRONMENT

    if (!appKey) {
      throw new Error(
        'VtexClient: credentials.extra.appKey is required (the X-VTEX-API-AppKey value)',
      )
    }
    if (!appToken) {
      throw new Error(
        'VtexClient: credentials.accessToken must hold the X-VTEX-API-AppToken value',
      )
    }
    if (!accountName) {
      throw new Error(
        'VtexClient: credentials.extra.accountName is required (e.g. "mystore")',
      )
    }

    this.baseUrl = `https://${accountName}.${environment}.com.br`

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-VTEX-API-AppKey': appKey,
        'X-VTEX-API-AppToken': appToken,
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

  async getRaw<T>(
    path: string,
    params?: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<AxiosResponse<T>> {
    return withRetry(async () => {
      return this.http.get<T>(path, { params, headers: extraHeaders })
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
   * List VTEX Orders using the OMS API with page/per_page pagination.
   *
   * Response: `{ list: [...], paging: { total, pages, currentPage, perPage } }`
   * Docs: GET /api/oms/pvt/orders
   */
  async listOrders<T>(extraParams: Record<string, unknown> = {}): Promise<PagedResult<T>> {
    const perPage = Math.min(
      (extraParams['per_page'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['per_page'] = perPage
    params['page'] = page

    const res = await this.get<{
      list: T[]
      paging?: { total?: number; pages?: number; currentPage?: number; perPage?: number }
    }>('/api/oms/pvt/orders', params)

    return {
      items: res.list ?? [],
      total: res.paging?.total,
      page: res.paging?.currentPage,
      perPage: res.paging?.perPage,
    }
  }

  /**
   * Search a VTEX Master Data v2 entity (e.g. `CL` for customers) using the
   * `REST-Range` header for pagination. Returns at most 100 documents per call.
   *
   * Docs: GET /api/dataentities/{entity}/search
   */
  async searchMasterData<T>(
    entity: string,
    fields: string[],
    extraParams: Record<string, unknown> = {},
    offset = 0,
  ): Promise<PagedResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? MD_MAX_PAGE_SIZE,
      MD_MAX_PAGE_SIZE,
    )
    const end = offset + limit - 1

    const params: Record<string, unknown> = { ...extraParams, _fields: fields.join(',') }
    delete params['limit']
    delete params['page']

    const res = await this.getRaw<T[]>(
      `/api/dataentities/${entity}/search`,
      params,
      { 'REST-Range': `resources=${offset}-${end}` },
    )

    const totalHeader = res.headers['rest-content-total'] as string | undefined
    const total = totalHeader ? parseInt(totalHeader, 10) : undefined

    return {
      items: (res.data ?? []) as T[],
      total,
    }
  }
}
