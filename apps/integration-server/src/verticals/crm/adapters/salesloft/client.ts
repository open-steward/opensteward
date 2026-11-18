import type { Credentials } from '../../adapter/interface'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

interface SalesloftListResponse<T> {
  data: T[]
  metadata?: {
    paging?: {
      next_page?: number | null
      total_count?: number
    }
  }
}

interface SalesloftItemResponse<T> {
  data: T
}

function bearerFrom(credentials: Credentials): string {
  return credentials.accessToken
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
      'Authorization': `Bearer ${bearerFrom(credentials)}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Salesloft API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class SalesloftClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean; nextPage?: number }> {
    const merged = { per_page: DEFAULT_PAGE_SIZE, ...params }
    const res = await request<SalesloftListResponse<T>>(
      'GET',
      path,
      this.credentials,
      merged,
    )
    const paging = res.metadata?.paging
    return {
      items: res.data ?? [],
      hasMore: paging?.next_page != null,
      nextPage: paging?.next_page ?? undefined,
    }
  }

  async get<T>(path: string): Promise<T> {
    const res = await request<SalesloftItemResponse<T>>(
      'GET',
      path,
      this.credentials,
    )
    return res.data
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<SalesloftItemResponse<T>>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<SalesloftItemResponse<T>>(
      'PUT',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
