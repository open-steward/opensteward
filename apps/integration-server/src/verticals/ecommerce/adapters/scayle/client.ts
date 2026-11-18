/**
 * SCAYLE Admin API client.
 *
 * Features:
 *  - `X-Access-Token` auth header (static API key, not Bearer).
 *  - Simple 429 / 5xx retry with exponential backoff.
 *  - `listWithCursor` helper that reads SCAYLE's cursor-based pagination.
 *    Responses are enveloped as `{ entities: [...], cursor: { next: '...' } }`.
 *    Pass the opaque `cursor.next` string as the `cursor` query param on the
 *    next request. When `cursor.next` is null there are no more pages.
 *
 * Docs: https://scayle.dev/api-guides/admin-api/getting-started/pagination
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

/**
 * SCAYLE collection envelope — list endpoints return:
 *   { entities: T[], cursor: { next: string | null } }
 */
interface ScayleCollection<T> {
  entities: T[]
  cursor?: { next?: string | null }
}

export class ScayleClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const tenantSpace = credentials.extra?.['tenantSpace'] as string | undefined
    if (!tenantSpace) {
      throw new Error(
        'ScayleClient: credentials.extra.tenantSpace is required (e.g. "acme-live")',
      )
    }

    this.http = axios.create({
      baseURL: buildBaseUrl(tenantSpace),
      headers: {
        'X-Access-Token': credentials.accessToken,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
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
   * List helper that follows SCAYLE's cursor-based pagination.
   *
   * SCAYLE envelopes list responses as:
   *   { entities: [...], cursor: { next: '<opaqueString>' | null } }
   *
   * Pass `cursor` as a query param to retrieve the next page.
   */
  async listWithCursor<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const params: Record<string, unknown> = {
      limit: Math.min(
        (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      ),
      ...extraParams,
    }
    const result = await this.get<ScayleCollection<T>>(path, params)
    return {
      items: result.entities ?? [],
      nextCursor: result.cursor?.next ?? undefined,
    }
  }
}
