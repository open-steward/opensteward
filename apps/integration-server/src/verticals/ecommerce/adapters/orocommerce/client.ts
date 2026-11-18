/**
 * OroCommerce JSON:API client.
 *
 * Key differences from other adapter clients:
 *  - Content-Type is `application/vnd.api+json` (JSON:API spec).
 *  - Responses are JSON:API envelopes: `{data, included, meta}`.
 *  - The client unwraps `data` and flattens `{id, attributes, relationships, type}`
 *    into `{id, ...attributes, _relationships, _type}` for transform consumption.
 *  - Updates use PATCH (not PUT) per JSON:API standard.
 *  - Pagination uses `page[size]` + `page[number]` (1-indexed).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CONTENT_TYPE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

// ── JSON:API envelope types ───────────────────────────────────────────────────

export interface JsonApiResource {
  type: string
  id: string
  attributes: Record<string, unknown>
  relationships?: Record<string, { data: { type: string; id: string } | Array<{ type: string; id: string }> | null }>
  meta?: Record<string, unknown>
}

export interface JsonApiResponse {
  data: JsonApiResource | JsonApiResource[]
  included?: JsonApiResource[]
  meta?: Record<string, unknown>
}

/** Flattened resource: id + all attributes at top level + _relationships + _type */
export type FlatResource = Record<string, unknown> & {
  id: string
  _type: string
  _relationships?: Record<string, unknown>
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
  throw new Error('unreachable')
}

// ── Flatten helpers ───────────────────────────────────────────────────────────

function flattenResource(resource: JsonApiResource): FlatResource {
  return {
    id: resource.id,
    ...resource.attributes,
    _type: resource.type,
    _relationships: resource.relationships as Record<string, unknown> | undefined,
  }
}

// ── List result ───────────────────────────────────────────────────────────────

export interface OroListResult<T> {
  items: T[]
  totalCount: number
  currentPage: number
  pageSize: number
}

// ── Client ────────────────────────────────────────────────────────────────────

export class OroClient {
  private http: AxiosInstance
  private baseApiUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const rawBase = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('OroClient: credentials.accessToken is required')
    }
    if (!rawBase) {
      throw new Error(
        'OroClient: credentials.extra.baseUrl is required (e.g. https://myoro.example)',
      )
    }

    this.baseApiUrl = `${rawBase.replace(/\/$/, '')}/api`
    this.http = axios.create({
      baseURL: this.baseApiUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': CONTENT_TYPE,
        Accept: CONTENT_TYPE,
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a single resource. Returns the flattened data object.
   */
  async get<T = FlatResource>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<JsonApiResponse>(path, { params })
      if (Array.isArray(data.data)) {
        return flattenResource(data.data[0]!) as T
      }
      return flattenResource(data.data) as T
    })
  }

  /**
   * POST a new resource. Body must be in JSON:API format.
   * Returns the flattened created resource.
   */
  async post<T = FlatResource>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<JsonApiResponse>(path, body)
      if (Array.isArray(data.data)) {
        return flattenResource(data.data[0]!) as T
      }
      return flattenResource(data.data) as T
    })
  }

  /**
   * PATCH an existing resource. JSON:API uses PATCH, not PUT.
   * Body: `{data: {type, id, attributes: {...}}}`
   */
  async patch<T = FlatResource>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<JsonApiResponse>(path, body)
      if (Array.isArray(data.data)) {
        return flattenResource(data.data[0]!) as T
      }
      return flattenResource(data.data) as T
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
   * List resources with page[size] + page[number] pagination.
   * Returns flattened items array plus totalCount from meta.
   */
  async listWithPage<T = FlatResource>(
    path: string,
    options: {
      currentPage?: number
      pageSize?: number
      filters?: Record<string, string>
    } = {},
  ): Promise<OroListResult<T>> {
    const currentPage = options.currentPage ?? 1
    const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      'page[size]': pageSize,
      'page[number]': currentPage,
    }
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        params[`filter[${key}]`] = value
      }
    }

    return withRetry(async () => {
      const { data } = await this.http.get<JsonApiResponse>(path, { params })
      const items = Array.isArray(data.data)
        ? data.data.map((r) => flattenResource(r) as T)
        : data.data
          ? [flattenResource(data.data) as T]
          : []
      const totalCount =
        (data.meta?.['totalCount'] as number | undefined) ??
        (data.meta?.['total_count'] as number | undefined) ??
        items.length
      return { items, totalCount, currentPage, pageSize }
    })
  }
}
