/**
 * NuORDER API client.
 *
 * Every request is signed with OAuth 1.0a (see oauth1.ts). Host is
 * `https://{env}.nuorder.com` (production has no subdomain — see
 * constants.ts). Paths are NOT uniformly versioned: catalogs live under
 * `/api/v3.1/...`, everything else under bare `/api/...`
 * (https://assets.nuorder.com/api-docs/index.html).
 *
 * List-endpoint responses are documented (and every example shown, e.g. for
 * Catalogs) as a bare JSON array — there is no envelope key anywhere in the
 * public reference. `unwrapList` therefore accepts ONLY a bare array and
 * fails loudly on anything else, rather than guessing at an envelope key
 * (`data`/`items`/`results`/…) that no doc page shows.
 */
import axios, { type AxiosInstance } from 'axios'
import { withRetry } from '@opensteward/shared'
import { buildAuthorizationHeader, type Oauth1Credentials } from './oauth1'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, NUORDER_ENVIRONMENTS, type NuorderEnvironment } from './constants'

export function baseUrlFor(env: NuorderEnvironment): string {
  return `https://${NUORDER_ENVIRONMENTS[env]}`
}

/** Confirmed for Catalogs (docs.md "Fetch all Catalogs"); applied consistently across list endpoints. */
export interface CursorParams {
  __limit?: number
  __last_id?: string
  __sort?: string
  __sort_order?: 'asc' | 'desc'
  [key: string]: unknown
}

export interface ListResult<T> {
  items: T[]
  /** Present when the underlying record carries an `id` field usable as the next `__last_id`. */
  lastId?: string
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  throw new Error(
    `NuORDER list response was not a bare JSON array (got ${typeof data}) — ` +
      'no envelope key is documented, so this is surfaced rather than guessed at.',
  )
}

export class NuorderClient {
  private http: AxiosInstance
  private oauth: Oauth1Credentials
  private baseUrl: string

  constructor(oauth: Oauth1Credentials, env: NuorderEnvironment) {
    this.oauth = oauth
    this.baseUrl = baseUrlFor(env)
    this.http = axios.create({ baseURL: this.baseUrl, timeout: 30_000 })
  }

  private authHeader(method: string, path: string, query: Record<string, string> = {}): string {
    const url = new URL(path, this.baseUrl).toString()
    return buildAuthorizationHeader(method, url, this.oauth, query)
  }

  async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: query,
        headers: { Authorization: this.authHeader('GET', path, query) },
      })
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: { Authorization: this.authHeader('PUT', path), 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { Authorization: this.authHeader('POST', path), 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, {
        headers: { Authorization: this.authHeader('PATCH', path), 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async delete<T = void>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, {
        headers: { Authorization: this.authHeader('DELETE', path) },
      })
      return data
    })
  }

  /**
   * One page of a `__limit`/`__last_id`-cursored list. NuORDER's cursor is
   * "the id of the last fetched record" (docs.md — Catalogs), so a caller
   * supplies the PREVIOUS page's last id, not an opaque server-minted token,
   * and a page shorter than `__limit` is the end.
   */
  async listWithCursor<T extends { id?: unknown }>(
    path: string,
    query: CursorParams,
  ): Promise<ListResult<T>> {
    const limit = Math.min(query.__limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const q: Record<string, string> = { __limit: String(limit) }
    if (query.__last_id != null) q.__last_id = query.__last_id
    if (query.__sort != null) q.__sort = query.__sort
    if (query.__sort_order != null) q.__sort_order = query.__sort_order
    for (const [k, v] of Object.entries(query)) {
      if (['__limit', '__last_id', '__sort', '__sort_order'].includes(k)) continue
      if (v != null) q[k] = String(v)
    }
    const raw = await this.get<unknown>(path, q)
    const items = unwrapList<T>(raw)
    const last = items[items.length - 1]
    const lastId = items.length === limit && last?.id != null ? String(last.id) : undefined
    return { items, lastId }
  }
}
