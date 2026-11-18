import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL } from './constants'

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  token: string,
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
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`ACT! CRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class ActCrmClient {
  private baseUrl: string
  private token: string

  constructor(credentials: Credentials) {
    this.baseUrl = String(credentials.extra?.['instanceUrl'] ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.token = credentials.accessToken
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> {
    const res = await request<{ results?: T[] } | T[]>(
      'GET',
      this.baseUrl,
      path,
      this.token,
      params,
    )
    if (Array.isArray(res)) return res
    return (res as { results?: T[] }).results ?? []
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
