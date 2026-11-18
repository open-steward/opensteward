import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

async function request<T>(
  method: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'key': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Holded API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class HoldedClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.token, params)
  }

  list<T>(path: string, params: Record<string, unknown> = {}): Promise<{ items: T[]; hasMore: boolean }> {
    return request<T[]>('GET', path, this.token, { limit: DEFAULT_PAGE_SIZE, ...params })
      .then((res) => ({ items: Array.isArray(res) ? res : [], hasMore: false }))
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.token, undefined, body)
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.token, undefined, body)
  }

  delete(path: string): Promise<void> {
    return request<void>('DELETE', path, this.token)
  }
}
