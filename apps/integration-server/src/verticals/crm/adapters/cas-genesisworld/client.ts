/**
 * HTTP client for the CAS genesisWorld REST API v7.
 *
 * Auth: HTTP Basic (username + API-key/password), encoded as base64 in the
 * `Authorization: Basic …` header.  The server URL is per-deployment and is
 * stored in `credentials.extra.serverUrl`.
 *
 * Pagination uses `page` (1-indexed) and `entries-per-page` query params.
 */
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

interface GwListResponse<T> {
  /** Array of result objects (address, appointment, todo, …). */
  dataObjects?: T[]
  /** Total number of matching records server-side. */
  totalCount?: number
  [key: string]: unknown
}

/** Shape returned by the smartsearch endpoint. */
interface GwSearchResponse<T> {
  results?: Array<{ dataObject?: T; objectType?: string; [key: string]: unknown }>
  totalCount?: number
  [key: string]: unknown
}

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  authHeader: string,
  params?: Record<string, string | number | boolean>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}/${API_VERSION}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`CAS genesisWorld API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content (DELETE responses)
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class CasGenesisworldClient {
  private readonly authHeader: string
  private readonly baseUrl: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    this.baseUrl = (extra['serverUrl'] ?? DEFAULT_BASE_URL).replace(/\/+$/, '')

    // Build HTTP Basic auth header from accessToken (username) and
    // refreshToken (API key / password).
    const username = credentials.accessToken
    const password = credentials.refreshToken ?? ''
    this.authHeader = `Basic ${btoa(`${username}:${password}`)}`
  }

  /**
   * Fetch a single object by GGUID.
   * e.g. GET /v7.0/type/address/{gguid}
   */
  async get<T>(path: string): Promise<T> {
    return request<T>('GET', this.baseUrl, path, this.authHeader)
  }

  /**
   * List objects with server-side pagination.
   * Returns the raw response so callers can inspect totalCount.
   */
  async list<T>(
    path: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<{ items: T[]; totalCount: number }> {
    const res = await request<GwListResponse<T>>('GET', this.baseUrl, path, this.authHeader, params)
    return {
      items: res.dataObjects ?? [],
      totalCount: res.totalCount ?? 0,
    }
  }

  /**
   * Smartsearch — universal search across object types.
   * GET /v7.0/smartsearch?query=…&objectTypes=…&page=…&entries-per-page=…
   */
  async smartSearch<T>(
    objectTypes: string,
    query: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: T[]; totalCount: number }> {
    const res = await request<GwSearchResponse<T>>(
      'GET',
      this.baseUrl,
      '/smartsearch',
      this.authHeader,
      {
        query,
        objectTypes,
        page,
        'entries-per-page': pageSize,
      },
    )
    const items: T[] = (res.results ?? [])
      .map((r) => r.dataObject)
      .filter((d): d is T => d !== undefined)
    return { items, totalCount: res.totalCount ?? items.length }
  }

  /** POST — create a new object. Returns the created object. */
  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', this.baseUrl, path, this.authHeader, undefined, body)
  }

  /** PUT — update an existing object. Returns the updated object. */
  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', this.baseUrl, path, this.authHeader, undefined, body)
  }

  /** DELETE — remove an object. */
  async delete(path: string): Promise<void> {
    await request<void>('DELETE', this.baseUrl, path, this.authHeader)
  }

  /** GET with query parameters — generic helper used for filtered lists. */
  async getWithParams<T>(
    path: string,
    params: Record<string, string | number | boolean>,
  ): Promise<T> {
    return request<T>('GET', this.baseUrl, path, this.authHeader, params)
  }

  get defaultPageSize(): number {
    return DEFAULT_PAGE_SIZE
  }
}
