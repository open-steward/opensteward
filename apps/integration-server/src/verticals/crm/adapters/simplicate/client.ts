/**
 * Simplicate REST API v2 client.
 *
 * Auth: every request includes:
 *   Authentication-Key: {apiKey}
 *   Authentication-Secret: {apiSecret}
 *
 * Pagination: offset/limit query params.
 * Response envelope:
 *   { data: T[], metadata?: { count, limit, offset } }     (list)
 *   { data: T }                                             (single)
 *
 * Docs: https://developer.simplicate.com/docs/api/v2/filtering/
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

export interface SimplicateListResponse<T> {
  data: T[]
  metadata?: {
    count?: number
    limit?: number
    offset?: number
  }
  errors?: unknown[]
}

export interface SimplicateSingleResponse<T> {
  data: T
  errors?: unknown[]
}

/** Resolve the base URL from credentials.extra.subdomain. */
function baseUrl(subdomain: string): string {
  return `https://${subdomain}.simplicate.nl/api/v2`
}

export class SimplicateClient {
  private apiKey: string
  private apiSecret: string
  private base: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    const extra = credentials.extra as Record<string, unknown> | undefined
    this.apiSecret = (extra?.apiSecret as string | undefined) ?? ''
    const subdomain = (extra?.subdomain as string | undefined) ?? ''
    this.base = baseUrl(subdomain)
  }

  private headers(): Record<string, string> {
    return {
      'Authentication-Key': this.apiKey,
      'Authentication-Secret': this.apiSecret,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(`${this.base}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v))
        }
      }
    }
    return url.toString()
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(this.buildUrl(path, params), {
      method,
      headers: this.headers(),
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Simplicate API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }

    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  /** GET a collection with limit/offset pagination. */
  async list<T>(
    path: string,
    offset = 0,
    limit = DEFAULT_PAGE_SIZE,
    extraParams: Record<string, unknown> = {},
  ): Promise<{ items: T[]; total?: number }> {
    const res = await this.request<SimplicateListResponse<T>>('GET', path, {
      limit,
      offset,
      'metadata': 'count,limit,offset',
      ...extraParams,
    })
    return {
      items: res.data ?? [],
      total: res.metadata?.count,
    }
  }

  /** GET a single resource by path (e.g. /crm/person/:id). */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.request<SimplicateSingleResponse<T>>('GET', path, params)
    return res.data
  }

  /** POST to create a resource. */
  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request<SimplicateSingleResponse<T>>('POST', path, undefined, body)
    return res.data
  }

  /** PUT to update a resource. */
  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request<SimplicateSingleResponse<T>>('PUT', path, undefined, body)
    return res.data
  }

  /** DELETE a resource. */
  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}
