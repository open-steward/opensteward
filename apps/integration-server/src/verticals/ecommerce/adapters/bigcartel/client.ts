/**
 * Big Cartel REST API client.
 *
 * Features:
 *  - Bearer token auth via API key in Authorization header.
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `listWithPage` helper for page-number-based pagination.
 *
 * Docs: https://developers.bigcartel.com/
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
  nextPage?: number
  totalItems?: number
}

export class BigCartelClient {
  private http: AxiosInstance
  private accountId: string

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    this.accountId =
      (credentials.extra?.['accountId'] as string | undefined) ?? ''

    if (!apiKey) {
      throw new Error('BigCartelClient: credentials.accessToken (API key) is required')
    }
    if (!this.accountId) {
      throw new Error(
        'BigCartelClient: credentials.extra.accountId is required',
      )
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  getAccountId(): string {
    return this.accountId
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
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
   * List helper for Big Cartel's page-number-based pagination.
   * Big Cartel returns JSON API-style responses with a `data` array
   * and optional pagination metadata.
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
    delete params['per_page']
    params['page[size]'] = perPage
    params['page[number]'] = page

    const res = await this.get<{ data: T[]; meta?: { count?: number } }>(
      path,
      params,
    )

    const items = res.data ?? []
    const totalItems = res.meta?.count
    const hasMore = items.length >= perPage
    const nextPage = hasMore ? page + 1 : undefined

    return { items, nextPage, totalItems }
  }
}
