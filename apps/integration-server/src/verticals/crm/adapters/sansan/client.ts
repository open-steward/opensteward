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
      // TODO: Verify header name from https://developer.sansan.com/
      // Sansan uses X-Sansan-Key for API key authentication
      'X-Sansan-Key': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Sansan API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class SansanClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.token, params)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const queryParams = { ...params, limit }

    // TODO: Verify Sansan pagination structure (may use cursor, offset, or page)
    const res = await request<{ data?: T[]; contacts?: T[] } | T[]>(
      'GET',
      path,
      this.token,
      queryParams,
    )

    if (Array.isArray(res)) return { items: res }
    const items = (res as Record<string, T[] | undefined>)['data']
      ?? (res as Record<string, T[] | undefined>)['contacts']
      ?? []
    return { items }
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
