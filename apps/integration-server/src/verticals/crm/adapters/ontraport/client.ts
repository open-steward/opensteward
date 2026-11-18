import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  appId: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
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
      'Api-Key': apiKey,
      'Api-Appid': appId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Ontraport API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class OntraportClient {
  private apiKey: string
  private appId: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.appId = String(credentials.extra?.['appId'] ?? '')
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> {
    const res = await request<{ data?: T[] }>(
      'GET',
      path,
      this.apiKey,
      this.appId,
      params,
    )
    return res.data ?? []
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await request<{ data?: T }>(
      'GET',
      path,
      this.apiKey,
      this.appId,
      params,
    )
    return res.data as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T }>(
      'POST',
      path,
      this.apiKey,
      this.appId,
      undefined,
      body,
    )
    return res.data as T
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T }>(
      'PUT',
      path,
      this.apiKey,
      this.appId,
      undefined,
      body,
    )
    return res.data as T
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    await request<void>('DELETE', path, this.apiKey, this.appId, params)
  }
}
