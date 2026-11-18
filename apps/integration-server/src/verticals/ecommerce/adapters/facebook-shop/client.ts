/**
 * Facebook Graph API HTTP client.
 *
 * Auth: access_token passed as query parameter (Graph API convention).
 * Pagination: cursor-based via `paging.cursors.after` / `paging.next`.
 * Retries: exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { GRAPH_API_BASE, DEFAULT_PAGE_SIZE } from './constants'

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

export class FacebookClient {
  private http: AxiosInstance
  private accessToken: string

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'FacebookClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.accessToken = credentials.accessToken
    this.http = axios.create({
      baseURL: GRAPH_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { ...params, access_token: this.accessToken },
      })
      return data
    })
  }

  async post<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { ...params, access_token: this.accessToken },
      })
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params: { ...params, access_token: this.accessToken },
      })
    })
  }

  /**
   * List helper for Graph API cursor-based pagination.
   *
   * Graph API returns `{ data: [...], paging: { cursors: { after }, next } }`.
   */
  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; total?: number; after?: string }> {
    const limit = (params['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const qp: Record<string, unknown> = { ...params, limit }
    const data = await this.get<Record<string, unknown>>(path, qp)

    const items = Array.isArray(data['data']) ? (data['data'] as T[]) : []
    const paging = data['paging'] as Record<string, unknown> | undefined
    const cursors = paging?.['cursors'] as Record<string, string> | undefined
    const after = cursors?.['after']
    const summary = data['summary'] as Record<string, unknown> | undefined
    const total = typeof summary?.['total_count'] === 'number'
      ? summary['total_count'] as number
      : undefined

    return { items, total, after }
  }
}
