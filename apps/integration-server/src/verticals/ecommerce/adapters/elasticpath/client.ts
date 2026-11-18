/**
 * Elastic Path API client.
 *
 * Key characteristics:
 *  - Responses use a JSON:API-like envelope: `{data, included, meta, links}`.
 *  - PCM products nest attributes directly under `data` (not `data.attributes`).
 *  - v2 resources (customers, orders, etc.) use `{data: {id, type, ...fields}}`.
 *  - Pagination: `page[offset]` + `page[limit]` with `meta.results.total`.
 *  - Updates use PUT (not PATCH) for most resources.
 *  - Content-Type is `application/json`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CONTENT_TYPE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, REGIONS, DEFAULT_REGION } from './constants'

// ── Response types ───────────────────────────────────────────────────────────

export interface EpResource {
  type: string
  id: string
  [key: string]: unknown
}

export interface EpResponse {
  data: EpResource | EpResource[]
  included?: Record<string, EpResource[]>
  meta?: Record<string, unknown>
  links?: Record<string, string | null>
}

export interface EpListResult<T> {
  items: T[]
  totalCount: number
  offset: number
  limit: number
}

// ── Retry helper ─────────────────────────────────────────────────────────────

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

// ── Client ───────────────────────────────────────────────────────────────────

export class EpClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const rawBase = credentials.extra?.['baseUrl'] as string | undefined
    const region = credentials.extra?.['region'] as string | undefined

    if (!token) {
      throw new Error('EpClient: credentials.accessToken is required')
    }

    const baseURL = rawBase?.replace(/\/$/, '') ?? REGIONS[region ?? DEFAULT_REGION]
    if (!baseURL) {
      throw new Error(
        'EpClient: credentials.extra.baseUrl or credentials.extra.region is required',
      )
    }

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': CONTENT_TYPE,
        Accept: CONTENT_TYPE,
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a single resource. Returns the `data` object from the envelope.
   */
  async get<T = EpResource>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<EpResponse>(path, { params })
      if (Array.isArray(data.data)) {
        return data.data[0] as T
      }
      return data.data as T
    })
  }

  /**
   * GET with full response envelope (for included/meta access).
   */
  async getWithEnvelope(path: string, params?: Record<string, unknown>): Promise<EpResponse> {
    return withRetry(async () => {
      const { data } = await this.http.get<EpResponse>(path, { params })
      return data
    })
  }

  /**
   * POST a new resource. Returns the `data` from the response envelope.
   */
  async post<T = EpResource>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<EpResponse>(path, body)
      if (Array.isArray(data.data)) {
        return data.data[0] as T
      }
      return data.data as T
    })
  }

  /**
   * PUT an existing resource.
   */
  async put<T = EpResource>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<EpResponse>(path, body)
      if (Array.isArray(data.data)) {
        return data.data[0] as T
      }
      return data.data as T
    })
  }

  /**
   * DELETE a resource.
   */
  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List resources with page[offset] + page[limit] pagination.
   */
  async list<T = EpResource>(
    path: string,
    options: {
      offset?: number
      limit?: number
      filters?: Record<string, string>
    } = {},
  ): Promise<EpListResult<T>> {
    const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = options.offset ?? 0
    const params: Record<string, unknown> = {
      'page[limit]': limit,
      'page[offset]': offset,
    }
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        params[`filter[${key}]`] = value
      }
    }

    return withRetry(async () => {
      const { data } = await this.http.get<EpResponse>(path, { params })
      const items = Array.isArray(data.data)
        ? (data.data as T[])
        : data.data
          ? [data.data as T]
          : []
      const meta = data.meta as Record<string, unknown> | undefined
      const results = meta?.['results'] as Record<string, unknown> | undefined
      const totalCount =
        (results?.['total'] as number | undefined) ??
        (meta?.['total'] as number | undefined) ??
        items.length
      return { items, totalCount, offset, limit }
    })
  }
}
