/**
 * Aimeos JSON:API client.
 *
 * Key characteristics:
 *  - Base URL is self-hosted: stored in `credentials.extra.baseUrl`.
 *  - All resources live under `{baseUrl}/api/{resource}` with JSON:API format.
 *  - Auth: `Authorization: Bearer {accessToken}`.
 *  - Content-Type: `application/vnd.api+json` (JSON:API spec).
 *  - Pagination: JSON:API `page[offset]` + `page[limit]` (offset-based).
 *  - Filters: `filter[{attr}]` style query params.
 *  - Updates: PATCH per JSON:API spec.
 *
 * The client keeps `data` in its raw JSON:API envelope shape so transforms
 * can access both `attributes` and `relationships` naturally.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CONTENT_TYPE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, API_PATH } from './constants'

// ── JSON:API envelope types ───────────────────────────────────────────────────

export interface AimeosRelationshipData {
  type: string
  id: string
}

export interface AimeosRelationship {
  data: AimeosRelationshipData | AimeosRelationshipData[] | null
  links?: Record<string, { href: string }>
}

export interface AimeosResource {
  type: string
  id: string
  attributes: Record<string, unknown>
  relationships?: Record<string, AimeosRelationship>
  links?: Record<string, { href: string }>
}

export interface AimeosEnvelope {
  data: AimeosResource | AimeosResource[]
  included?: AimeosResource[]
  meta?: Record<string, unknown>
  links?: {
    self?: string | { href: string }
    next?: string | { href: string }
    prev?: string | { href: string }
    last?: string | { href: string }
  }
}

export interface AimeosListResult<T> {
  items: T[]
  hasMore: boolean
  totalCount?: number
}

// ── Retry helper ──────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
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

export class AimeosClient {
  private http: AxiosInstance
  private apiBase: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    // `apiUrl` is the full JSON API entry point collected by Connect Link and
    // used verbatim; `baseUrl` is the legacy site root that assumed `/api`.
    const apiUrl = credentials.extra?.['apiUrl'] as string | undefined
    const baseUrl = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('AimeosClient: credentials.accessToken is required')
    }
    if (!apiUrl && !baseUrl) {
      throw new Error(
        'AimeosClient: credentials.extra.apiUrl is required ' +
          '(e.g. https://shop.example.com/admin/default/jsonadm)',
      )
    }

    this.apiBase = apiUrl
      ? apiUrl.replace(/\/+$/, '')
      : `${(baseUrl as string).replace(/\/$/, '')}${API_PATH}`
    this.http = axios.create({
      baseURL: this.apiBase,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': CONTENT_TYPE,
        Accept: CONTENT_TYPE,
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a single JSON:API resource by path.
   */
  async get(path: string, params?: Record<string, unknown>): Promise<AimeosResource> {
    return withRetry(async () => {
      const { data } = await this.http.get<AimeosEnvelope>(path, { params })
      if (Array.isArray(data.data)) {
        const first = data.data[0]
        if (!first) throw new Error(`AimeosClient: no resource found at ${path}`)
        return first
      }
      return data.data as AimeosResource
    })
  }

  /**
   * POST a new JSON:API resource. Body must be in JSON:API format.
   */
  async post(path: string, body: unknown): Promise<AimeosResource> {
    return withRetry(async () => {
      const { data } = await this.http.post<AimeosEnvelope>(path, body)
      if (Array.isArray(data.data)) {
        const first = data.data[0]
        if (!first) throw new Error('AimeosClient: POST returned empty data array')
        return first
      }
      return data.data as AimeosResource
    })
  }

  /**
   * PATCH an existing JSON:API resource.
   */
  async patch(path: string, body: unknown): Promise<AimeosResource> {
    return withRetry(async () => {
      const { data } = await this.http.patch<AimeosEnvelope>(path, body)
      if (Array.isArray(data.data)) {
        const first = data.data[0]
        if (!first) throw new Error('AimeosClient: PATCH returned empty data array')
        return first
      }
      return data.data as AimeosResource
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
  ): Promise<AimeosListResult<AimeosResource>> {
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
      const { data } = await this.http.get<AimeosEnvelope>(path, { params })
      const items = Array.isArray(data.data)
        ? data.data
        : data.data
          ? [data.data as AimeosResource]
          : []
      const totalCount = data.meta?.['total'] as number | undefined
      const hasMore = resolveLink(data.links?.next) != null
      return { items, hasMore, totalCount }
    })
  }
}
