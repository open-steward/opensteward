import type { Credentials } from '@opensteward/shared'
import { usBaseUrl, VITALLY_EU_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

/**
 * Resolve the base URL from credentials.
 *
 * credentials.extra?.subdomain — US subdomain (e.g. "acme")
 * credentials.extra?.region    — "eu" to use the EU datacenter
 * If neither is supplied, falls back to the EU fixed base URL so callers
 * can still run against the EU DC without a subdomain.
 */
function resolveBaseUrl(credentials: Credentials): string {
  const extra = credentials.extra as Record<string, unknown> | undefined
  if (extra?.['region'] === 'eu') return VITALLY_EU_BASE_URL
  const subdomain = extra?.['subdomain']
  if (typeof subdomain === 'string' && subdomain.trim()) {
    return usBaseUrl(subdomain.trim())
  }
  return VITALLY_EU_BASE_URL
}

interface VitallyListResponse<T> {
  results: T[]
  /** Cursor for the next page; null/undefined when on the last page. */
  next?: string | null
}

export class VitallyClient {
  readonly baseUrl: string
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.baseUrl = resolveBaseUrl(credentials)
  }

  /**
   * Encode the API key as Base64 for the Basic auth header.
   * Vitally expects:  Authorization: Basic <base64(apiKey)>
   */
  private authHeader(): string {
    const encoded =
      typeof globalThis.btoa === 'function'
        ? globalThis.btoa(this.apiKey)
        : Buffer.from(this.apiKey).toString('base64')
    return `Basic ${encoded}`
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
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
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Vitally API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }

    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; next?: string | null }> {
    const res = await this.request<VitallyListResponse<T>>('GET', path, {
      limit: DEFAULT_PAGE_SIZE,
      ...params,
    })
    return {
      items: res.results ?? [],
      next: res.next,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}
