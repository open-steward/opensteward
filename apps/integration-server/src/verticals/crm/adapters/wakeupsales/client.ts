import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

// Wakeupsales: API key header auth
// TODO: verify header name — docs may use 'X-Access-Token' or 'apikey'
// Base URL: https://app.wakeupsales.com/api/v1/
// Docs: https://apidocs.wakeupsales.com/

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
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
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      // TODO: confirm header name against https://apidocs.wakeupsales.com/
      'X-Access-Token': apiKey,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Wakeupsales API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class WakeupsalesClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> {
    const per_page = Number(params['per_page'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const res = await request<{ data?: T[]; contacts?: T[]; leads?: T[]; results?: T[] } | T[]>(
      'GET',
      path,
      this.apiKey,
      { ...params, per_page, page },
    )
    if (Array.isArray(res)) return res
    const r = res as { data?: T[]; contacts?: T[]; leads?: T[]; results?: T[] }
    return r?.data ?? r?.contacts ?? r?.leads ?? r?.results ?? []
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await request<{ data?: T }>(
      'GET',
      path,
      this.apiKey,
      params,
    )
    return (res?.data ?? res) as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T }>(
      'POST',
      path,
      this.apiKey,
      undefined,
      body,
    )
    return (res?.data ?? res) as T
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T }>(
      'PUT',
      path,
      this.apiKey,
      undefined,
      body,
    )
    return (res?.data ?? res) as T
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey)
  }
}
