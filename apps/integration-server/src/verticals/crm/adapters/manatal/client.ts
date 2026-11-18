import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/** Standard Manatal paginated list response. */
export interface ManatalPage<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
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
      // Manatal uses Django REST Framework Token auth.
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Manatal API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content — DELETE / PATCH with no body
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class ManatalClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  /** GET a paginated list resource. */
  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<ManatalPage<T>> {
    return request<ManatalPage<T>>('GET', path, this.apiKey, params)
  }

  /** GET a single resource by ID. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiKey, params)
  }

  /** POST (create) a resource. */
  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, undefined, body)
  }

  /** PATCH (partial update) a resource. */
  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, this.apiKey, undefined, body)
  }

  /** DELETE a resource. */
  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey)
  }
}
