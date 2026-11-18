import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
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
      'User-Key': credentials.accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Ploomes API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class PloomesClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const res = await request<{ value?: T[] }>(
      'GET', path, this.credentials, params,
    )
    return { items: res.value ?? [] }
  }

  async get<T>(path: string): Promise<T> {
    const res = await request<{ value?: T[] }>(
      'GET', path, this.credentials,
    )
    const item = res.value?.[0]
    if (item == null) {
      throw Object.assign(new Error(`Ploomes: not found — ${path}`), { statusCode: 404 })
    }
    return item
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ value?: T[] }>(
      'POST', path, this.credentials, undefined, body,
    )
    const item = res.value?.[0]
    if (item == null) throw new Error(`Ploomes: POST ${path} returned no data`)
    return item
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ value?: T[] }>(
      'PATCH', path, this.credentials, undefined, body,
    )
    return (res.value?.[0] ?? res) as unknown as T
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
