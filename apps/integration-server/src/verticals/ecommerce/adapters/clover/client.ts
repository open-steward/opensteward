/**
 * Clover API client.
 *
 * Features:
 *  - Bearer token on every request.
 *  - Merchant-scoped base URL: `/v3/merchants/{merchantId}/`.
 *  - `listWithOffset` helper for offset/limit pagination.
 *  - 429/5xx retry with exponential backoff.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  ENVIRONMENTS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type CloverEnvironment,
} from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status != null && status >= 500)) && i < retries) {
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
  hasMore: boolean
}

export class CloverClient {
  private http: AxiosInstance
  readonly merchantId: string

  constructor(credentials: Credentials) {
    const env = (credentials.extra?.['environment'] as CloverEnvironment) ?? 'production'
    const baseHost = ENVIRONMENTS[env] ?? ENVIRONMENTS.production
    this.merchantId = (credentials.extra?.['merchantId'] as string) ?? ''
    if (!this.merchantId) {
      throw new Error('Clover adapter requires merchantId in credentials.extra')
    }
    const baseURL = `${baseHost}/v3/merchants/${this.merchantId}/`
    this.http = axios.create({
      baseURL,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Generic list helper for Clover endpoints that use offset/limit pagination.
   *
   * Clover returns `{ elements: [...] }` for list endpoints.
   */
  async listWithOffset<T>(
    path: string,
    offset: number = 0,
    limit: number = DEFAULT_PAGE_SIZE,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const effectiveLimit = Math.min(limit, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      offset,
      limit: effectiveLimit,
      ...extraParams,
    }
    const res = await this.get<{ elements?: T[] }>(path, params)
    const items = res.elements ?? []
    return { items, hasMore: items.length >= effectiveLimit }
  }
}
