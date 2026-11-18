/**
 * Etsy Open API v3 HTTP client.
 *
 * Key differences from Amazon SP-API:
 *
 *  - Auth requires BOTH `Authorization: Bearer {token}` AND `x-api-key: {apiKeyString}`.
 *  - Pagination uses `offset` + `limit` with a `count` field in the response.
 *  - No opaque cursor tokens — purely numeric offset pagination.
 *  - Retries follow the same exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

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
  count: number
  offset: number
}

export class EtsyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKeyString = credentials.extra?.['apiKeyString'] as string | undefined
    if (!apiKeyString) {
      throw new Error(
        'EtsyClient: credentials.extra.apiKeyString is required — include it when creating the connection.',
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'EtsyClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'x-api-key': apiKeyString,
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
   * List helper that follows Etsy's offset+limit pagination.
   *
   * Etsy responses have shape: `{ count: N, results: [...] }`.
   * The caller passes `resourceKey` (defaults to `results`).
   */
  async list<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
    resourceKey = 'results',
  ): Promise<ListResult<T>> {
    const limit =
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const offset = (extraParams['offset'] as number | undefined) ?? 0
    const params: Record<string, unknown> = {
      ...extraParams,
      limit,
      offset,
    }

    const data = await this.get<Record<string, unknown>>(path, params)

    const items = Array.isArray(data[resourceKey])
      ? (data[resourceKey] as T[])
      : []
    const count = typeof data['count'] === 'number' ? (data['count'] as number) : items.length

    return { items, count, offset }
  }
}
