/**
 * Recharge Payments REST API client.
 *
 * Features:
 *  - `X-Recharge-Access-Token` header authentication (store API token).
 *  - `X-Recharge-Version: 2021-11` pinned for stable field contracts.
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithCursor` helper that reads Recharge's cursor-based pagination
 *    (`next_cursor` in the response body) and returns it to callers.
 *
 * Pagination: responses carry a top-level `next_cursor` (and `previous_cursor`)
 * string. Pass `cursor=<next_cursor>` as a query param for the next page.
 * Default limit 50; max 250.
 *
 * Docs: https://developer.rechargepayments.com/2021-11
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, API_VERSION_HEADER, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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
  nextCursor?: string
}

export class RechargeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    if (!token) {
      throw new Error(
        'RechargeClient: credentials.accessToken (API token) is required.',
      )
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'X-Recharge-Access-Token': token,
        'X-Recharge-Version': API_VERSION_HEADER,
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
   * List helper that follows Recharge's cursor-based pagination.
   *
   * `resourceKey` is the top-level key in the response envelope that holds
   * the array (e.g. `"customers"`, `"orders"`, `"products"`).
   *
   * Returns `nextCursor` from the response envelope so callers can pass it
   * back in `extraParams.cursor` for subsequent pages.
   */
  async listWithCursor<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const params: Record<string, unknown> = { ...extraParams, limit }
    delete params['limit']
    params['limit'] = limit

    const envelope = await this.get<Record<string, unknown>>(path, params)
    const items = (envelope[resourceKey] ?? []) as T[]
    const nextCursor =
      typeof envelope['next_cursor'] === 'string' ? envelope['next_cursor'] : undefined

    return { items, nextCursor }
  }
}
