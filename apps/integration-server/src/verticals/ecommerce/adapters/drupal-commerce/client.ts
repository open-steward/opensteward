/**
 * Drupal Commerce JSON:API client.
 *
 * Key characteristics:
 *  - Base URL is self-hosted: stored in `credentials.extra.baseUrl`.
 *  - All resources live under `{baseUrl}/jsonapi/` with JSON:API format.
 *  - Auth: `Authorization: Bearer {accessToken}`.
 *  - Content-Type: `application/vnd.api+json` (JSON:API spec).
 *  - Pagination: JSON:API `page[offset]` + `page[limit]` (offset-based).
 *  - Updates: PATCH per JSON:API spec.
 *  - Includes: `?include=field_variations` etc.
 *
 * The client exposes a `JsonApiResource` shape matching Drupal's JSON:API
 * envelope and keeps `data` in its raw, un-flattened form so transforms can
 * access both `attributes` and `relationships` naturally.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CONTENT_TYPE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, JSONAPI_PATH } from './constants'

// ── JSON:API envelope types ───────────────────────────────────────────────────

export interface JsonApiRelationshipData {
  type: string
  id: string
}

export interface JsonApiRelationship {
  data: JsonApiRelationshipData | JsonApiRelationshipData[] | null
  links?: Record<string, { href: string }>
}

export interface JsonApiResource {
  type: string
  id: string
  attributes: Record<string, unknown>
  relationships?: Record<string, JsonApiRelationship>
  links?: Record<string, { href: string }>
}

export interface JsonApiEnvelope {
  data: JsonApiResource | JsonApiResource[]
  included?: JsonApiResource[]
  meta?: Record<string, unknown>
  links?: {
    self?: string | { href: string }
    next?: string | { href: string }
    prev?: string | { href: string }
    last?: string | { href: string }
  }
}

export interface DrupalListResult<T> {
  items: T[]
  hasMore: boolean
  totalCount?: number
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

// ── Link extraction ───────────────────────────────────────────────────────────

function resolveLink(link: string | { href: string } | undefined): string | undefined {
  if (!link) return undefined
  if (typeof link === 'string') return link
  return link.href
}

// ── Client ────────────────────────────────────────────────────────────────────

export class DrupalCommerceClient {
  private http: AxiosInstance
  private jsonApiBase: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const baseUrl = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('DrupalCommerceClient: credentials.accessToken is required')
    }
    if (!baseUrl) {
      throw new Error(
        'DrupalCommerceClient: credentials.extra.baseUrl is required ' +
          '(e.g. https://myshop.example.com)',
      )
    }

    this.jsonApiBase = `${baseUrl.replace(/\/$/, '')}${JSONAPI_PATH}`
    this.http = axios.create({
      baseURL: this.jsonApiBase,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': CONTENT_TYPE,
        Accept: CONTENT_TYPE,
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a single JSON:API resource. Returns the raw JsonApiResource.
   */
  async get(path: string, params?: Record<string, unknown>): Promise<JsonApiResource> {
    return withRetry(async () => {
      const { data } = await this.http.get<JsonApiEnvelope>(path, { params })
      if (Array.isArray(data.data)) {
        const first = data.data[0]
        if (!first) throw new Error(`DrupalCommerceClient: no resource found at ${path}`)
        return first
      }
      return data.data as JsonApiResource
    })
  }

  /**
   * POST a new JSON:API resource. Body must be in JSON:API format.
   * Returns the raw created JsonApiResource.
   */
  async post(path: string, body: unknown): Promise<JsonApiResource> {
    return withRetry(async () => {
      const { data } = await this.http.post<JsonApiEnvelope>(path, body)
      if (Array.isArray(data.data)) {
        const first = data.data[0]
        if (!first) throw new Error('DrupalCommerceClient: POST returned empty data array')
        return first
      }
      return data.data as JsonApiResource
    })
  }

  /**
   * PATCH an existing JSON:API resource.
   * Body: `{data: {type, id, attributes: {...}}}`
   */
  async patch(path: string, body: unknown): Promise<JsonApiResource> {
    return withRetry(async () => {
      const { data } = await this.http.patch<JsonApiEnvelope>(path, body)
      if (Array.isArray(data.data)) {
        const first = data.data[0]
        if (!first) throw new Error('DrupalCommerceClient: PATCH returned empty data array')
        return first
      }
      return data.data as JsonApiResource
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
   * List resources with offset-based pagination.
   * Returns raw JsonApiResource items plus a hasMore flag.
   */
  async list(
    path: string,
    options: {
      offset?: number
      limit?: number
      filters?: Record<string, string>
      include?: string
      sort?: string
    } = {},
  ): Promise<DrupalListResult<JsonApiResource>> {
    const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = options.offset ?? 0
    const params: Record<string, unknown> = {
      'page[offset]': offset,
      'page[limit]': limit,
    }
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        params[`filter[${key}]`] = value
      }
    }
    if (options.include) {
      params['include'] = options.include
    }
    if (options.sort) {
      params['sort'] = options.sort
    }

    return withRetry(async () => {
      const { data } = await this.http.get<JsonApiEnvelope>(path, { params })
      const items = Array.isArray(data.data) ? data.data : data.data ? [data.data as JsonApiResource] : []
      const totalCount = data.meta?.['count'] as number | undefined
      const hasMore = resolveLink(data.links?.next) != null
      return { items, hasMore, totalCount }
    })
  }
}
