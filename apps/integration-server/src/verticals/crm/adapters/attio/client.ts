import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, string | number | undefined>,
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
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Attio API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res.json() as Promise<T>
}

interface AttioQueryResponse<T> {
  data: T[]
  next_cursor: string | null
}

interface AttioItemResponse<T> {
  data: T
}

export class AttioClient {
  constructor(private credentials: Credentials) {}

  /** POST a query endpoint (Attio uses POST for list/search). */
  async query<T>(
    path: string,
    body: Record<string, unknown> = {},
  ): Promise<{ items: T[]; nextCursor: string | null }> {
    const res = await request<AttioQueryResponse<T>>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    return { items: res.data ?? [], nextCursor: res.next_cursor ?? null }
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const res = await request<AttioItemResponse<T>>(
      'GET',
      path,
      this.credentials,
      params,
    )
    return res.data
  }

  /** GET a paginated list endpoint (used for notes). */
  async list<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<{ items: T[]; nextCursor: string | null }> {
    const res = await request<{ data: T[]; next_cursor?: string | null }>(
      'GET',
      path,
      this.credentials,
      params,
    )
    return { items: res.data ?? [], nextCursor: res.next_cursor ?? null }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<AttioItemResponse<T>>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await request<AttioItemResponse<T>>(
      'PATCH',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<Record<string, unknown>>(
      'DELETE',
      path,
      this.credentials,
    )
  }
}
