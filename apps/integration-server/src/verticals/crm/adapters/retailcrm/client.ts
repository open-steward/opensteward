import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

const FALLBACK_BASE_URL = 'https://demo.retailcrm.ru/api/v5'

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'X-API-Key': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`RetailCRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class RetailCrmClient {
  private token: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
    this.baseUrl = (credentials.extra?.['instanceUrl'] as string | undefined) ?? FALLBACK_BASE_URL
  }

  async list<T>(
    resourceKey: string,
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const res = await request<Record<string, unknown>>(
      'GET',
      this.baseUrl,
      path,
      this.token,
      { limit: DEFAULT_PAGE_SIZE, page: 1, ...params },
    )
    return { items: (res[resourceKey] as T[] | undefined) ?? [], hasMore: false }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', this.baseUrl, path, this.token, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', this.baseUrl, path, this.token, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', this.baseUrl, path, this.token, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', this.baseUrl, path, this.token)
  }
}
