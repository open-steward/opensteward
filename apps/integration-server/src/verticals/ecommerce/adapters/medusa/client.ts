/**
 * Medusa v2 Admin API client.
 *
 * Features:
 *  - Bearer token auth via API key.
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithOffset` helper that reads Medusa's offset-based pagination
 *    (`count`, `offset`, `limit` in the response body).
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
  /** Total rows matching the query, or undefined when the response omits `count`. */
  count: number | undefined
  offset: number
  limit: number
}

export class MedusaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const host = credentials.extra?.['host'] as string | undefined

    if (!apiKey) {
      throw new Error('MedusaClient: credentials.accessToken (API key) is required')
    }
    if (!host) {
      throw new Error(
        'MedusaClient: credentials.extra.host is required (e.g. https://my-medusa.example.com)',
      )
    }

    const baseURL = `${host.replace(/\/$/, '')}/admin`
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * List helper for Medusa's offset-based pagination. The response body
   * contains `count`, `offset`, and `limit` alongside the resource array.
   *
   * @param path    API path (e.g. `/products`)
   * @param key     The key in the response that holds the array (e.g. `products`)
   * @param extraParams  Additional query parameters
   */
  async listWithOffset<T>(
    path: string,
    key: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams['offset'] as number | undefined) ?? 0

    const params: Record<string, unknown> = { ...extraParams, limit, offset }

    const res = await this.get<Record<string, unknown>>(path, params)
    const items = (res[key] ?? []) as T[]
    return {
      items,
      count: typeof res['count'] === 'number' ? res['count'] : undefined,
      offset: (res['offset'] as number) ?? offset,
      limit: (res['limit'] as number) ?? limit,
    }
  }
}
