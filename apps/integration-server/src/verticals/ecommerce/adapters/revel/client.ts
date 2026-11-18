/**
 * Revel Systems API client.
 *
 * Features:
 *  - API key auth via `API-AUTHENTICATION` header ({apiKey}:{apiSecret}).
 *  - Falls back to Bearer token if no API key is provided.
 *  - Base URL: `https://{subdomain}.revelup.com/resources/`.
 *  - `list` helper for offset/limit pagination (Revel uses `?offset=N&limit=N`).
 *  - 429/5xx retry with exponential backoff.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  buildBaseUrl,
  RESOURCES_PREFIX,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
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
  /** From `meta.next`; undefined when Revel sent no `meta.next` to read. */
  hasMore?: boolean
}

export class RevelClient {
  private http: AxiosInstance
  readonly subdomain: string

  constructor(credentials: Credentials) {
    this.subdomain = (credentials.extra?.['subdomain'] as string) ?? ''
    if (!this.subdomain) {
      throw new Error('Revel adapter requires subdomain in credentials.extra')
    }

    const baseURL = `${buildBaseUrl(this.subdomain)}${RESOURCES_PREFIX}/`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    // API key auth takes precedence
    const apiKey = credentials.extra?.['apiKey'] as string | undefined
    const apiSecret = credentials.extra?.['apiSecret'] as string | undefined
    if (apiKey && apiSecret) {
      headers['API-AUTHENTICATION'] = `${apiKey}:${apiSecret}`
    } else if (credentials.accessToken) {
      headers['Authorization'] = `Bearer ${credentials.accessToken}`
    }

    this.http = axios.create({
      baseURL,
      headers,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * The absolute URL of a documented path outside /resources/ — the suites
   * document /products/ProductCategory/ and /enterprise/Establishment/ at the
   * host root. An absolute URL bypasses the client's /resources/ base.
   */
  rootUrl(path: string): string {
    return `${buildBaseUrl(this.subdomain)}${path}`
  }

  /**
   * Generic list helper for Revel endpoints that use offset/limit pagination.
   *
   * Revel returns `{ objects: [...], meta: { total_count, limit, offset, next } }`.
   * The 2025.3.0 suites document the /products/ and /enterprise/ lists as a bare
   * JSON array instead, which is read as the page with nothing said about what
   * follows it (`hasMore` undefined) — and with no `meta.limit` to catch a cut
   * limit, so the adapter does not take a short bare answer as the end.
   */
  async list<T>(
    path: string,
    offset: number = 0,
    limit: number = DEFAULT_PAGE_SIZE,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const effectiveLimit = Math.min(limit, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      offset,
      limit: effectiveLimit,
      format: 'json',
      ...extraParams,
    }
    const answer = await this.get<
      T[] | { objects?: T[]; meta?: { next?: string | null; limit?: number } }
    >(path, params)
    if (Array.isArray(answer)) return { items: answer }
    const res = answer ?? {}
    // Revel's lists are django-tastypie (github.com/RevelSystems/django-tastypie):
    // a `limit` above the resource's `max_limit` is cut to it without an error,
    // and `meta.limit` carries the limit actually used. A silently short page
    // reads as the last one, ending a sync early and marking the collection
    // complete, so a cut limit fails loudly here instead.
    const used = res.meta?.limit
    if (typeof used === 'number' && used < effectiveLimit) {
      throw new Error(
        `Revel served at most ${used} rows per request for ${path} (meta.limit) but ` +
          `${effectiveLimit} were asked for; paging by ${effectiveLimit} would skip rows. ` +
          `Lower the Revel adapter's MAX_PAGE_SIZE to ${used}.`,
      )
    }
    const items = res.objects ?? []
    const next = res.meta?.next
    return {
      items,
      hasMore: typeof next === 'string' ? true : next === null ? false : undefined,
    }
  }
}
