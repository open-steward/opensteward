/**
 * Noon Seller API HTTP client.
 *
 * All requests carry `Authorization: Bearer <accessToken>` and an
 * `X-Noon-Locale` header resolved from `credentials.extra.locale`.
 *
 * Noon returns JSON envelopes `{ data, pagination?, error? }`.
 * The client includes exponential-backoff retry for 429 / 5xx.
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
  totalCount?: number
}

export class NoonClient {
  private http: AxiosInstance
  private locale: string

  constructor(credentials: Credentials) {
    const accessToken = credentials.accessToken ?? ''
    this.locale = (credentials.extra?.['locale'] as string | undefined) ?? 'ae'

    if (!accessToken) {
      throw new Error(
        'NoonClient: credentials.accessToken is required -- provide your Noon API key ' +
          'or ensure the OAuth2 flow has completed.',
      )
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Noon-Locale': this.locale,
        'Accept-Language': this.locale === 'eg' ? 'ar' : 'en',
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

  async post<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, { params })
      return data
    })
  }

  async put<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, { params })
      return data
    })
  }

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }

  /**
   * Generic list helper for Noon's cursor/offset-based pagination.
   *
   * Noon list responses follow `{ data: { items: [...] }, pagination: { total } }`.
   */
  async list<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const page = (extraParams['page'] as number | undefined) ?? 1
    const params: Record<string, unknown> = {
      ...extraParams,
      limit,
      page,
    }

    const res = await this.get<{
      data?: { items?: T[] }
      pagination?: { total?: number }
      error?: { message?: string; code?: string }
    }>(path, params)

    if (res.error?.code) {
      throw new Error(`Noon API error: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }

    const items = res.data?.items ?? []
    const totalCount = res.pagination?.total ?? undefined

    return { items, totalCount }
  }
}
