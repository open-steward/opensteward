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
      new Error(`Deskera API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class DeskeraClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 0)
    const queryParams = { ...params, limit, page }

    const res = await request<T[] | { data?: T[]; content?: T[] }>(
      'GET',
      path,
      this.token,
      queryParams,
    )

    const items: T[] = Array.isArray(res)
      ? res
      : ((res as { data?: T[] }).data ?? (res as { content?: T[] }).content ?? [])
    return { items, hasMore: items.length >= limit }
  }

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.token)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.token, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.token, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token)
  }
}
