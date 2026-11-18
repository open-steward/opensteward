/**
 * PrestaShop Webservice API client.
 *
 * Features:
 *  - HTTP Basic auth header built from API key (username) with empty password.
 *  - Always sets `output_format=JSON` query param on every request to avoid
 *    XML responses (PrestaShop's default).
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithPage` helper that uses PrestaShop's `?limit=offset,count`
 *    pagination format.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

export interface ListResult<T> {
  items: T[]
  nextPage?: number
  totalItems?: number
}

export class PrestaShopClient {
  private http: AxiosInstance
  private baseUrl: string

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const site = credentials.extra?.['site'] as string | undefined

    if (!apiKey) {
      throw new Error(
        'PrestaShopClient: credentials.accessToken (API key) is required',
      )
    }
    if (!site) {
      throw new Error(
        'PrestaShopClient: credentials.extra.site is required (e.g. https://shop.example.com)',
      )
    }

    // PrestaShop API key is used as Basic auth username with empty password.
    this.baseUrl = `${site.replace(/\/$/, '')}/api`
    const basic = Buffer.from(`${apiKey}:`).toString('base64')
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // PrestaShop defaults to XML — always request JSON via query param as belt-and-suspenders.
      params: {
        output_format: 'JSON',
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

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * List helper using PrestaShop's offset-based pagination.
   *
   * PrestaShop uses `?limit=offset,count` format for pagination and
   * `?display=full` to return all fields (otherwise only ids are returned).
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1
    const offset = (page - 1) * perPage

    // Build params — strip our virtual keys so we don't double-send.
    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    delete params['page']
    delete params['per_page']
    params['display'] = 'full'
    params['limit'] = `${offset},${perPage}`

    const res = await this.get<Record<string, T[]>>(path, params)

    // PrestaShop wraps list responses in a top-level key matching the
    // resource name (e.g. { products: [...] }, { categories: [...] }).
    // Extract the first array value.
    const items = Object.values(res).find(Array.isArray) ?? ([] as T[])

    // Determine if there is a next page.
    const hasMore = items.length >= perPage
    return {
      items,
      nextPage: hasMore ? page + 1 : undefined,
    }
  }
}
