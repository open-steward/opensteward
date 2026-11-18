import type { Credentials } from '@opensteward/shared'
import { DEFAULT_INSTANCE_URL, DEFAULT_PAGE_SIZE } from './constants'

// Mautic: OAuth2 (Bearer token)
// Base URL from credentials.extra.instanceUrl with fallback to demo
// API at /api/

async function request<T>(
  method: string,
  path: string,
  accessToken: string,
  baseUrl: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}/api${path}`)
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
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Mautic API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class MauticClient {
  private accessToken: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.accessToken = credentials.accessToken
    this.baseUrl = (credentials.extra?.['instanceUrl'] as string | undefined) ?? DEFAULT_INSTANCE_URL
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; raw: Record<string, unknown> }> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const start = Number(params['start'] ?? 0)
    return this.fetchPage<T>(path, { ...params, limit, start })
  }

  /**
   * One GET of a list endpoint with exactly `params` as the query, plus the
   * whole response body so a caller can read `total` / `maxPages`.
   */
  async fetchPage<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<{ items: T[]; raw: Record<string, unknown> }> {
    const res =
      (await request<Record<string, unknown>>('GET', path, this.accessToken, this.baseUrl, params)) ?? {}
    // Mautic wraps items in the endpoint name (e.g., 'contacts', 'companies', 'segments')
    // Try each common key
    const candidates = Object.values(res)
    for (const val of candidates) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const inner = Object.values(val as Record<string, unknown>)
        if (inner.length > 0 && typeof inner[0] === 'object') {
          return { items: inner as unknown as T[], raw: res }
        }
      }
      if (Array.isArray(val)) return { items: val as T[], raw: res }
    }
    return { items: [], raw: res }
  }

  async get<T>(path: string): Promise<T> {
    const res = await request<Record<string, unknown>>('GET', path, this.accessToken, this.baseUrl)
    // Mautic wraps single items in a key matching the resource name
    const keys = Object.keys(res ?? {})
    if (keys.length === 1 && typeof res[keys[0]] === 'object') {
      return res[keys[0]] as unknown as T
    }
    return res as unknown as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<Record<string, unknown>>('POST', path, this.accessToken, this.baseUrl, undefined, body)
    const keys = Object.keys(res ?? {})
    if (keys.length === 1 && typeof res[keys[0]] === 'object') {
      return res[keys[0]] as unknown as T
    }
    return res as unknown as T
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<Record<string, unknown>>('PATCH', path, this.accessToken, this.baseUrl, undefined, body)
    const keys = Object.keys(res ?? {})
    if (keys.length === 1 && typeof res[keys[0]] === 'object') {
      return res[keys[0]] as unknown as T
    }
    return res as unknown as T
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.accessToken, this.baseUrl)
  }
}
