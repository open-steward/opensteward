/**
 * Shift4Shop REST API client.
 *
 * Features:
 *  - Static key auth via `PrivateKey` and `Token` request headers.
 *  - Offset-based pagination via `?limit=100&offset=0`.
 *  - Exponential backoff retry on 429 and 5xx responses.
 *
 * Credentials shape:
 *   accessToken → PrivateKey header
 *   extra.token → Token header
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
  nextOffset?: number
}

export class Shift4ShopClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const privateKey = credentials.accessToken
    const token = credentials.extra?.['token'] as string | undefined

    if (!privateKey) {
      throw new Error(
        'Shift4ShopClient: credentials.accessToken (PrivateKey) is required',
      )
    }
    if (!token) {
      throw new Error(
        'Shift4ShopClient: credentials.extra.token (public Token) is required',
      )
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        PrivateKey: privateKey,
        Token: token,
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
   * List helper using Shift4Shop's offset-based pagination.
   *
   * Shift4Shop uses `?limit=N&offset=N` query params for pagination.
   */
  async listWithOffset<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams['offset'] as number | undefined) ?? 0

    const params: Record<string, unknown> = { ...extraParams }
    delete params['offset']
    params['limit'] = perPage
    params['offset'] = offset

    const res = await this.get<T[]>(path, params)

    // Shift4Shop returns a flat array (not wrapped).
    const items = Array.isArray(res) ? res : []
    const nextOffset = items.length >= perPage ? offset + perPage : undefined

    return { items, nextOffset }
  }

  /**
   * One page of a list endpoint at exactly `limit` rows from `offset`
   * ("limit: Maximum number of items that can be returned", "offset: Starting
   * point for the return data"). The caller clamps `limit` to the endpoint's
   * batch size and strides `offset` by it.
   *
   * Every list endpoint answers 404 when nothing matches ("No orders found.",
   * "No Customer records found."), which is also what a page past the end
   * gets: that is an empty page, not an error.
   */
  async listPage<T>(path: string, params: Record<string, unknown>): Promise<T[]> {
    try {
      const res = await this.get<T[]>(path, params)
      return Array.isArray(res) ? res : []
    } catch (err) {
      if ((err as AxiosError).response?.status === 404) return []
      throw err
    }
  }
}
