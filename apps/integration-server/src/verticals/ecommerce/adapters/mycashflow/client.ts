/**
 * MyCashflow REST API client.
 *
 * Features:
 *  - HTTP Basic Auth via `Authorization: Basic <base64>` header.
 *  - Exponential backoff retry on 429 and 5xx responses.
 *  - `listWithPage` helper for MyCashflow's page-based pagination:
 *    requests use `?page=N&page_size=N`, responses carry a `meta` object
 *    with `page`, `page_size`, `page_count`, and `item_count`.
 *  - Response envelope: `{ data: T | T[], meta: {...} }`.
 *
 * Docs: https://support.mycashflow.com/api/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildAuthHeader } from './auth'

/**
 * Build the v0 REST base URL (campaigns endpoint lives there).
 */
function buildBaseUrlV0(storeName: string): string {
  const host = storeName.includes('.')
    ? storeName.replace(/\/$/, '')
    : `${storeName}.mycashflow.fi`
  return `https://${host}/api/v0`
}

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

/**
 * MyCashflow pagination meta object returned with every list response.
 */
export interface MyCashflowMeta {
  page: number
  page_size: number
  page_count: number
  item_count: number
}

/**
 * Standard list response envelope from MyCashflow.
 */
export interface MyCashflowListResponse<T> {
  data: T[]
  meta: MyCashflowMeta
}

/**
 * Standard single-item response envelope from MyCashflow.
 */
export interface MyCashflowItemResponse<T> {
  data: T
}

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalPages?: number
  totalItems?: number
}

export class MyCashflowClient {
  private http: AxiosInstance
  private httpV0: AxiosInstance

  constructor(credentials: Credentials) {
    const storeName = credentials.extra?.['storeName'] as string | undefined
    const username = credentials.extra?.['username'] as string | undefined
    const password = credentials.extra?.['password'] as string | undefined

    if (!storeName) {
      throw new Error(
        'MyCashflowClient: credentials.extra.storeName is required (e.g. myshop)',
      )
    }
    if (!username || !password) {
      throw new Error(
        'MyCashflowClient: credentials.extra.username and credentials.extra.password are required',
      )
    }

    const headers = {
      Authorization: buildAuthHeader(username, password),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    this.http = axios.create({
      baseURL: buildBaseUrl(storeName),
      headers,
      timeout: 30_000,
    })

    this.httpV0 = axios.create({
      baseURL: buildBaseUrlV0(storeName),
      headers,
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /** GET against the v0 API (used by campaigns/discounts). */
  async getV0<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.httpV0.get<T>(path, { params })
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
   * List helper for MyCashflow's page-based pagination.
   *
   * Sends `?page=N&page_size=M` and reads the `meta` envelope to determine
   * whether there is a next page.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams['page_size'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 0

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['page_size'] = pageSize
    params['page'] = page

    const res = await this.get<MyCashflowListResponse<T>>(path, params)
    const meta = res.meta
    const nextPage =
      meta && meta.page < meta.page_count - 1 ? meta.page + 1 : undefined

    return {
      items: res.data ?? [],
      nextPage,
      totalPages: meta?.page_count,
      totalItems: meta?.item_count,
    }
  }

  /**
   * List helper targeting the v0 API endpoint (used for campaigns/discounts).
   */
  async listWithPageV0<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams['page_size'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 0

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['page_size'] = pageSize
    params['page'] = page

    const res = await this.getV0<MyCashflowListResponse<T>>(path, params)
    const meta = res.meta
    const nextPage =
      meta && meta.page < meta.page_count - 1 ? meta.page + 1 : undefined

    return {
      items: res.data ?? [],
      nextPage,
      totalPages: meta?.page_count,
      totalItems: meta?.item_count,
    }
  }
}
