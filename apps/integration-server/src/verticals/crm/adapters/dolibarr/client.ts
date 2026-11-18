import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

// Dolibarr: DOLAPIKEY header authentication
// credentials.accessToken = the API key token
// Base URL: ${instanceUrl}/api/index.php

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  baseUrl: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`)
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
      'DOLAPIKEY': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Dolibarr API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class DolibarrClient {
  private apiKey: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    const instanceUrl = credentials.extra?.['instanceUrl'] as string | undefined
    if (!instanceUrl) throw new Error('credentials.extra.instanceUrl is required for Dolibarr')
    this.baseUrl = `${instanceUrl}/api/index.php`
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiKey, this.baseUrl, params)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 0)  // Dolibarr uses 0-based pagination
    const queryParams = { ...params, limit, page }

    const res = await request<unknown>('GET', path, this.apiKey, this.baseUrl, queryParams)
    // Dolibarr returns arrays directly
    const items = Array.isArray(res) ? res as T[] : []
    return { items }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, this.baseUrl, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.apiKey, this.baseUrl, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey, this.baseUrl)
  }
}
