import type { Credentials } from '@opensteward/shared'

/**
 * HighLevelClient — thin HTTP wrapper around the HighLevel v2 REST API.
 *
 * Base URL: https://services.leadconnectorhq.com
 * Every request must carry the `Version: 2021-07-28` header.
 */

export const HL_BASE_URL = 'https://services.leadconnectorhq.com'
export const HL_API_VERSION = '2021-07-28'

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      Version: HL_API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`HighLevel API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  return res.json() as Promise<T>
}

export class HighLevelClient {
  constructor(private credentials: Credentials) {}

  get locationId(): string {
    const id = this.credentials.extra?.['locationId'] as string | undefined
    if (!id) throw new Error('HighLevel: credentials.extra.locationId is required')
    return id
  }

  async list<T>(
    path: string,
    itemsKey: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean; meta?: Record<string, unknown>; count?: unknown }> {
    const url = new URL(`${HL_BASE_URL}${path}`)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }

    const res = await request<Record<string, unknown>>('GET', url.toString(), this.credentials)

    const items = (res[itemsKey] as T[] | undefined) ?? []
    const meta = res['meta'] as Record<string, unknown> | undefined
    const hasMore = items.length > 0 && meta != null
    return { items, hasMore, meta, count: res['count'] }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const url = new URL(`${HL_BASE_URL}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }
    return request<T>('GET', url.toString(), this.credentials)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', `${HL_BASE_URL}${path}`, this.credentials, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', `${HL_BASE_URL}${path}`, this.credentials, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', `${HL_BASE_URL}${path}`, this.credentials)
  }
}
