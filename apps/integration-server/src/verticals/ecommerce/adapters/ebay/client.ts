/**
 * eBay REST API HTTP client.
 *
 * Auth header is `Authorization: Bearer <accessToken>`.
 * Pagination uses `offset` + `limit` with `total` in the response.
 * Retries follow exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, DEFAULT_PAGE_SIZE, ENVIRONMENTS } from './constants'

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
  total?: number
  offset?: number
  limit?: number
}

export class EbayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const environment =
      (credentials.extra?.['environment'] as string | undefined) ?? DEFAULT_ENVIRONMENT
    const envCfg = ENVIRONMENTS[environment]
    if (!envCfg) {
      throw new Error(
        `EbayClient: unknown environment '${environment}'. Valid: ${Object.keys(ENVIRONMENTS).join(', ')}.`,
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'EbayClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.http = axios.create({
      baseURL: `https://${envCfg.apiHost}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
   * List helper for eBay's offset-based pagination.
   *
   * eBay endpoints return `{ total, inventoryItems: [...] }` or
   * `{ total, orders: [...] }` etc. The caller passes `resourceKey`
   * to locate the array in the response.
   */
  async list<T>(
    path: string,
    resourceKey: string,
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = (params['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const offset = (params['offset'] as number | undefined) ?? 0
    const qp = { ...params, limit, offset }
    const data = await this.get<Record<string, unknown>>(path, qp)

    const items = Array.isArray(data[resourceKey]) ? (data[resourceKey] as T[]) : []
    const total = typeof data['total'] === 'number' ? data['total'] : undefined

    return { items, total, offset, limit }
  }
}
