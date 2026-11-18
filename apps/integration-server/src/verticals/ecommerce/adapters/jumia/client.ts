/**
 * Jumia Vendor API HTTP client with Bearer token auth.
 *
 * All requests to the Jumia API include a Bearer token in the Authorization
 * header. The client handles retries for transient errors (429, 5xx).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { resolveBaseUrl, DEFAULT_PAGE_SIZE } from './constants'

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

export class JumiaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const country = (credentials.extra?.['country'] as string | undefined) ?? 'ng'
    const baseURL = resolveBaseUrl(country)
    const accessToken = credentials.accessToken ?? ''

    if (!accessToken) {
      throw new Error(
        'JumiaClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }

    this.http = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
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
   * List helper for Jumia's offset-based pagination.
   */
  async list<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const offset = (extraParams['offset'] as number | undefined) ?? 0
    const params: Record<string, unknown> = {
      ...extraParams,
      limit,
      offset,
    }

    const res = await this.get<{ data?: Record<string, unknown>; success?: boolean; message?: string }>(
      path,
      params,
    )

    const container = res.data ?? {}
    const items = (container[resourceKey] as T[] | undefined) ?? []
    const totalCount =
      (container['total'] as number | undefined) ??
      (container['count'] as number | undefined) ??
      undefined

    return { items, totalCount }
  }
}
