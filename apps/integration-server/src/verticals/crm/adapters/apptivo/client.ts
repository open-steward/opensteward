import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

async function request<T>(
  method: string,
  path: string,
  apiSecret: string,
  accessKey: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('api_secret', apiSecret)
  url.searchParams.set('access_key', accessKey)
  if (method === 'GET' && params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Apptivo API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class ApptivoClient {
  private apiSecret: string
  private accessKey: string

  constructor(credentials: Credentials) {
    // credentials.accessToken = api_secret; credentials.extra.accessKey = access_key
    this.apiSecret = credentials.accessToken
    this.accessKey = String(credentials.extra?.['accessKey'] ?? '')
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> {
    const res = await request<{ data?: T[] } | T[]>(
      'GET',
      path,
      this.apiSecret,
      this.accessKey,
      params,
    )
    if (Array.isArray(res)) return res
    return (res as { data?: T[] }).data ?? []
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiSecret, this.accessKey, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiSecret, this.accessKey, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.apiSecret, this.accessKey, undefined, body)
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    await request<void>('DELETE', path, this.apiSecret, this.accessKey, params)
  }
}
