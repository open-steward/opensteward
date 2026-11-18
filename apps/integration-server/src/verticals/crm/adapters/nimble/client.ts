import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, V2_BASE_URL } from './constants'

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
  base: string = BASE_URL,
): Promise<T> {
  const url = new URL(`${base}${path}`)
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
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Nimble API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  return res.json() as Promise<T>
}

export class NimbleClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    resourcesKey: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; total: number }> {
    const merged = { per_page: DEFAULT_PAGE_SIZE, page: 1, ...params }
    const res = await request<Record<string, unknown>>('GET', path, this.credentials, merged)
    const items = (res[resourcesKey] as T[] | undefined) ?? []
    const meta = res['meta'] as { total?: number } | undefined
    return { items, total: meta?.total ?? items.length }
  }

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.credentials)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<unknown>('DELETE', path, this.credentials)
  }

  /** GET on the documented /api/v2 surface (deals and deal pipelines). */
  async getV2<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.credentials, undefined, undefined, V2_BASE_URL)
  }

  async rawGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.credentials, params)
  }
}
