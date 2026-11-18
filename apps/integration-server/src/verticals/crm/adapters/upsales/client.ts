import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/**
 * A query value. An array sends the key once per element, which the
 * documented opportunity filter needs: `probability=gte:1&probability=lte:99`.
 */
export type QueryValue = string | number | readonly (string | number)[]

/**
 * The documented list envelope, e.g. from "Get contact list":
 * `{ "error": null, "metadata": { "total": 5, "limit": 1000, "offset": 0 }, "data": [...] }`.
 */
export interface UpsalesListResponse<T> {
  error?: unknown
  metadata?: { total?: number; limit?: number; offset?: number }
  data?: T[]
}

async function request<T>(
  method: string,
  path: string,
  token: string,
  params?: Record<string, QueryValue | undefined>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  // Every documented request authenticates with the API key as a query
  // parameter: "https://integration.upsales.com/api/v2/contacts/?token={{token}}".
  url.searchParams.set('token', token)
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined) continue
    for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(item))
  }

  const res = await fetch(url.toString(), {
    method,
    // "Always include content-type: application/json as a header"
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Upsales API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class UpsalesClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  /** Single resource wrapped in { data: T } */
  async get<T>(path: string): Promise<T> {
    const res = await request<{ data: T }>('GET', path, this.token)
    return res.data
  }

  /** One page of a list endpoint, with the documented `metadata` envelope. */
  async list<T>(
    path: string,
    params: Record<string, QueryValue | undefined>,
  ): Promise<{ items: T[]; total: number | undefined }> {
    const res = await request<UpsalesListResponse<T>>('GET', path, this.token, params)
    const total = res.metadata?.total
    return { items: res.data ?? [], total: typeof total === 'number' ? total : undefined }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data: T }>('POST', path, this.token, undefined, body)
    return res.data
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data: T }>('PUT', path, this.token, undefined, body)
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token)
  }
}
