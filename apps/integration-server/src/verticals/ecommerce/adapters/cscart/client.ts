/**
 * CS-Cart REST API client.
 *
 * Features:
 *  - HTTP Basic auth built from `extra.email` + `accessToken` (API key).
 *  - Retries with exponential backoff on 429 and 5xx responses.
 *  - `listWithPage` helper that reads CS-Cart's page-based pagination embedded
 *    in the `params` response envelope (`total_items`, `page`).
 *
 * CS-Cart list responses look like:
 * ```json
 * { "products": [...], "params": { "total_items": 100, "page": 2 } }
 * ```
 * The outer key varies by resource (`products`, `orders`, `users`, etc.).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBasicAuth } from './auth'
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

/** CS-Cart pagination params embedded inside list responses. */
export interface CsCartPageParams {
  total_items?: number | string
  page?: number | string
  items_per_page?: number | string
}

export interface ListResult<T> {
  items: T[]
  totalItems?: number
  page?: number
}

export class CsCartClient {
  private http: AxiosInstance
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
    const email = credentials.extra?.['email'] as string | undefined

    if (!baseUrl) {
      throw new Error(
        'CsCartClient: credentials.extra.baseUrl is required (e.g. https://mystore.example.com)',
      )
    }
    if (!email) {
      throw new Error(
        'CsCartClient: credentials.extra.email is required (admin email used for Basic auth)',
      )
    }
    if (!apiKey) {
      throw new Error(
        'CsCartClient: credentials.accessToken is required (CS-Cart API key)',
      )
    }

    this.baseUrl = `${baseUrl.replace(/\/$/, '')}/api`
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: buildBasicAuth(email, apiKey),
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

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * Fetch a paginated list from CS-Cart. CS-Cart wraps items in a key named
   * after the resource (`products`, `orders`, `users`, etc.) alongside a
   * `params` envelope that carries pagination metadata.
   *
   * @param path    API path, e.g. `products`
   * @param key     JSON key for the items array, e.g. `products`
   * @param extras  Additional query parameters (page, items_per_page, etc.)
   */
  async listWithPage<T>(
    path: string,
    key: string,
    extras: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      (extras['items_per_page'] as number | undefined) ??
        (extras['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extras['page'] as number | undefined) ?? 1
    const params: Record<string, unknown> = { ...extras, items_per_page: perPage, page }
    delete params['limit']

    const raw = await this.get<Record<string, unknown>>(path, params)
    const items = (raw[key] ?? []) as T[]
    const pageParams = raw['params'] as CsCartPageParams | undefined

    return {
      items,
      totalItems: pageParams?.total_items != null
        ? Number(pageParams.total_items)
        : undefined,
      page: pageParams?.page != null ? Number(pageParams.page) : page,
    }
  }
}
