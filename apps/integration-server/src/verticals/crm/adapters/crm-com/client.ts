import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

// CRM.COM authenticates via 'Api-key' header (api_key in credentials.accessToken)

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
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
      'Api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`CRM.COM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class CrmComClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiKey, params)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const size = Number(params['size'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const res = await request<{ content?: T[]; data?: T[]; items?: T[] }>(
      'GET', path, this.apiKey, { ...params, size, page },
    )
    const items = res?.content ?? res?.data ?? res?.items ?? []
    return { items: Array.isArray(items) ? items : [] }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.apiKey, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey)
  }
}
