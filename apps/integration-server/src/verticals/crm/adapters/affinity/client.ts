import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/** A v2 list response: `pagination.nextUrl` is null on the last page. */
export interface AffinityV2PagedResponse<T> {
  data?: T[]
  pagination?: { nextUrl?: string | null }
}

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
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Affinity API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class AffinityClient {
  constructor(private credentials: Credentials) {}

  /**
   * One v2 page: `cursor` + `limit` (1..100), the next page's cursor read
   * from `pagination.nextUrl` ("use it for your" next request). Only
   * `cursor` and `limit` are sent — the v1 `page_size` / `page_token` are not
   * v2 parameters.
   */
  async listV2<T>(
    path: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: T[]; nextCursor?: string }> {
    const res = await request<AffinityV2PagedResponse<T>>('GET', path, this.credentials, {
      limit,
      cursor,
    })
    const nextUrl = res.pagination?.nextUrl
    const nextCursor = nextUrl
      ? (new URL(nextUrl, BASE_URL).searchParams.get('cursor') ?? undefined)
      : undefined
    return { items: res.data ?? [], nextCursor }
  }

  /**
   * The rows of a v2 list matching `filter` (the documented `filter` query
   * parameter, e.g. `id=1`), first page only.
   */
  async filterV2<T>(path: string, filter: string): Promise<T[]> {
    const res = await request<AffinityV2PagedResponse<T>>('GET', path, this.credentials, {
      filter,
    })
    return res.data ?? []
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.credentials, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
