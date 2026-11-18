/**
 * Patreon JSON:API client.
 *
 * Key characteristics:
 *  - Content-Type is `application/json` but response bodies use JSON:API
 *    envelope format: `{data, included, meta, links}`.
 *  - The client unwraps `data` and flattens `{id, attributes, relationships, type}`
 *    into `{id, ...attributes, _relationships, _type}` for transform consumption.
 *  - Patreon uses cursor-based pagination via `links.next`.
 *  - All fields must be explicitly requested via `fields[resource_type]` params.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

// ── JSON:API envelope types ───────────────────────────────────────────────────

export interface JsonApiResource {
  type: string
  id: string
  attributes: Record<string, unknown>
  relationships?: Record<
    string,
    {
      data: { type: string; id: string } | Array<{ type: string; id: string }> | null
      links?: Record<string, string>
    }
  >
  meta?: Record<string, unknown>
}

export interface JsonApiResponse {
  data: JsonApiResource | JsonApiResource[]
  included?: JsonApiResource[]
  meta?: { pagination?: { total?: number; cursors?: { next?: string | null } } }
  links?: { next?: string | null }
}

/** Flattened resource: id + all attributes at top level + _relationships + _type */
export type FlatResource = Record<string, unknown> & {
  id: string
  _type: string
  _relationships?: Record<string, unknown>
  _included?: FlatResource[]
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

function flattenIncluded(included?: JsonApiResource[]): FlatResource[] | undefined {
  if (!included || included.length === 0) return undefined
  return included.map(flattenResource)
}

// ── List result ───────────────────────────────────────────────────────────────

export interface PatreonListResult<T> {
  items: T[]
  totalCount: number
  nextCursor: string | null
}

// ── Client ────────────────────────────────────────────────────────────────────

export class PatreonClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = credentials.accessToken

    if (!token) {
      throw new Error('PatreonClient: credentials.accessToken is required')
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a single resource. Returns the flattened data object with included
   * resources attached as `_included`.
   */
  async get<T = FlatResource>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<JsonApiResponse>(path, { params })
      const main = Array.isArray(data.data)
        ? flattenResource(data.data[0]!)
        : flattenResource(data.data)
      main._included = flattenIncluded(data.included)
      return main as T
    })
  }

  /**
   * List resources with cursor-based pagination.
   * Patreon uses `page[count]` for page size and `page[cursor]` for cursor.
   */
  async list<T = FlatResource>(
    path: string,
    options: {
      pageSize?: number
      cursor?: string | null
      params?: Record<string, unknown>
    } = {},
  ): Promise<PatreonListResult<T>> {
    const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      ...options.params,
      'page[count]': pageSize,
    }
    if (options.cursor) {
      params['page[cursor]'] = options.cursor
    }

    return withRetry(async () => {
      const { data } = await this.http.get<JsonApiResponse>(path, { params })
      const included = flattenIncluded(data.included)
      const items = Array.isArray(data.data)
        ? data.data.map((r) => {
            const flat = flattenResource(r)
            flat._included = included
            return flat as T
          })
        : data.data
          ? [(() => {
              const flat = flattenResource(data.data as JsonApiResource)
              flat._included = included
              return flat as T
            })()]
          : []
      const totalCount = data.meta?.pagination?.total ?? items.length
      const nextCursor = data.meta?.pagination?.cursors?.next ?? null
      return { items, totalCount, nextCursor }
    })
  }
}
