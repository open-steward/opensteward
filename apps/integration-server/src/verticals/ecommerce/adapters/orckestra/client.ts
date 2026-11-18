/**
 * Orckestra REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {access_token}` header on every request.
 *  - Base URL: `https://{instance}.orckestra.cloud/api` (from credentials.extra.baseUrl).
 *  - Exponential-backoff retry on 429 + 5xx responses (up to 4 retries).
 *  - `listPaginated` helper that handles Orckestra's `{ Products|Orders: [], TotalCount }` envelopes.
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
  /* istanbul ignore next */
  throw new Error('unreachable')
}

export interface OrckestraPaginatedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
}

export class OrckestraClient {
  private http: AxiosInstance
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
    if (!baseUrl) {
      throw new Error(
        'OrckestraClient: credentials.extra.baseUrl is required ' +
          '(e.g. https://{instance}.orckestra.cloud/api)',
      )
    }
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.http = axios.create({
      baseURL: this.baseUrl,
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

  async delete<T = unknown>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path)
      return data
    })
  }

  /**
   * Paginated list helper for Orckestra's standard envelope pattern.
   *
   * Orckestra list endpoints return `{ <EntityKey>: T[], TotalCount: number }`.
   * Pass `entityKey` (e.g. `'Products'` or `'Orders'`) so the helper can
   * unwrap the correct array.
   */
  async listPaginated<T>(
    path: string,
    entityKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<OrckestraPaginatedResult<T>> {
    const pageSize = Math.min(
      (extraParams['pageSize'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = {
      ...extraParams,
      pageSize,
      page,
    }
    // Remove canonical aliases so we don't send duplicates
    delete params['limit']

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await this.get<any>(path, params)
    const items: T[] = Array.isArray(res[entityKey]) ? (res[entityKey] as T[]) : []
    const totalCount: number =
      typeof res['TotalCount'] === 'number' ? (res['TotalCount'] as number) : items.length

    return { items, totalCount, page, pageSize }
  }
}
