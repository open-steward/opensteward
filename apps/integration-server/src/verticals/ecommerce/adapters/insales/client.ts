/**
 * InSales Admin REST API client.
 *
 * Features:
 *  - HTTP Basic auth built from api_id + api_secret (or from per-connection
 *    credentials stored in `accessToken` / `extra.apiSecret` / `extra.shop`).
 *  - 429 retry with exponential backoff (respects `Retry-After` header).
 *  - `listWithPage` helper for InSales page-based pagination (`per_page`,
 *    `page`). InSales also supports `from_id` cursor iteration but page-based
 *    is simpler and sufficient for OpenSteward's sync pattern.
 *
 * Base URL: `https://{shop}.myinsales.ru/admin`
 *
 * Docs: https://www.insales.ru/collection/doc-rabota-s-api-i-prilozheniya/product/kak-sdelat-zapros-k-api
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  /** Next page number if more items exist, else undefined. */
  nextPage?: number
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
        const retryAfter = axiosErr.response?.headers?.['retry-after']
        const delay = retryAfter ? parseInt(String(retryAfter), 10) * 1000 : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class InsalesClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Credentials layout:
    //   accessToken  = api_id (the "login" portion of Basic auth)
    //   extra.apiSecret = api_secret
    //   extra.shop      = shop subdomain, e.g. "myshop" or "myshop.myinsales.ru"
    const apiId =
      (credentials.extra?.['apiId'] as string | undefined) ??
      credentials.accessToken

    const apiSecret = credentials.extra?.['apiSecret'] as string | undefined
    const shopRaw = credentials.extra?.['shop'] as string | undefined

    if (!apiSecret) {
      throw new Error(
        'InsalesClient: credentials.extra.apiSecret is required',
      )
    }
    if (!shopRaw) {
      throw new Error(
        'InsalesClient: credentials.extra.shop is required (e.g. "myshop" or "myshop.myinsales.ru")',
      )
    }

    const shopHost = shopRaw.endsWith('.myinsales.ru')
      ? shopRaw
      : `${shopRaw}.myinsales.ru`

    const basic = Buffer.from(`${apiId}:${apiSecret}`).toString('base64')

    this.http = axios.create({
      baseURL: `https://${shopHost}/admin`,
      headers: {
        Authorization: `Basic ${basic}`,
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
   * Fetch one page of results. InSales returns plain arrays at the top level
   * (no envelope key). If the page is full (length === per_page) we assume
   * there is a next page.
   *
   * @param path  e.g. `/orders.json`
   * @param extraParams  additional query params (updated_since, from_id, …)
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
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

    const items = await this.get<T[]>(path, params)
    const arr = Array.isArray(items) ? items : []
    const nextPage = arr.length >= perPage ? page + 1 : undefined

    return { items: arr, nextPage }
  }
}
