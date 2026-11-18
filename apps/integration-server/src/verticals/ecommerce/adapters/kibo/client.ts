/**
 * Kibo Commerce API client.
 *
 * Key characteristics:
 *  - Base URL: `https://{tenant}.mozu.com` or `https://api.mozu.com` for the
 *    shared gateway.
 *  - Auth: `Authorization: Bearer {accessToken}`.
 *  - Collection responses: `{ items: T[], totalCount, pageSize, startIndex }`.
 *  - Pagination: `pageSize` + `startIndex` (0-based offset).
 *  - Retries: exponential back-off on 429 and 5xx responses.
 *  - Content-Type: `application/json`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CONTENT_TYPE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { normaliseTenantHost, resolveBaseUrl, tenantIdFromHost } from './auth'

// ── Response envelope types ───────────────────────────────────────────────────

export interface KiboListResult<T> {
  items: T[]
  totalCount: number
  pageSize: number
  startIndex: number
}

// ── Retry helper ──────────────────────────────────────────────────────────────

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

// ── Client ────────────────────────────────────────────────────────────────────

export class KiboClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    if (!token) {
      throw new Error('KiboClient: credentials.accessToken is required')
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': CONTENT_TYPE,
      Accept: CONTENT_TYPE,
    }
    let baseURL: string
    const tenantHost = credentials.extra?.['tenantHost']
    if (typeof tenantHost === 'string' && tenantHost) {
      // Throws for a host outside Kibo's domains: the bearer token goes nowhere else.
      const host = normaliseTenantHost(tenantHost)
      baseURL = `https://${host}`
      headers['x-vol-tenant'] = tenantIdFromHost(host)
    } else {
      // Connections stored before the tenant host was collected.
      baseURL = resolveBaseUrl(credentials.extra?.['tenant'] as string | undefined)
    }

    this.http = axios.create({ baseURL, headers, timeout: 30_000 })
  }

  /**
   * GET a single resource by path.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /**
   * POST a resource. Returns the response body.
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  /**
   * PUT (full replace) a resource.
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
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
   * List resources using Kibo's `pageSize` / `startIndex` pagination.
   * Returns all fields from the envelope.
   */
  async list<T>(
    path: string,
    options: {
      pageSize?: number
      startIndex?: number
      filter?: string
      sortBy?: string
      [key: string]: unknown
    } = {},
  ): Promise<KiboListResult<T>> {
    const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const startIndex = options.startIndex ?? 0

    const params: Record<string, unknown> = { pageSize, startIndex }
    if (options.filter) params['filter'] = options.filter
    if (options.sortBy) params['sortBy'] = options.sortBy

    // Pass any extra caller-supplied params through
    for (const [k, v] of Object.entries(options)) {
      if (!['pageSize', 'startIndex', 'filter', 'sortBy'].includes(k) && v !== undefined) {
        params[k] = v
      }
    }

    return withRetry(async () => {
      const { data } = await this.http.get<KiboListResult<T>>(path, { params })
      return {
        items: data.items ?? [],
        totalCount: data.totalCount ?? 0,
        pageSize: data.pageSize ?? pageSize,
        startIndex: data.startIndex ?? startIndex,
      }
    })
  }
}
