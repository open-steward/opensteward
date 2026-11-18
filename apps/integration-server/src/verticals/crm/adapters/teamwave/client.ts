import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

interface TeamwaveListResponse<T> {
  data: T[]
  meta?: {
    total_pages?: number
    current_page?: number
    total_count?: number
  }
}

interface TeamwaveItemResponse<T> {
  data: T
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
      'Authorization': `Token ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Teamwave API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (method === 'DELETE') {
    return {} as T
  }

  return res.json() as Promise<T>
}

export class TeamwaveClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const mergedParams: Record<string, unknown> = {
      per_page: params['limit'] ?? DEFAULT_PAGE_SIZE,
      page: params['page'] ?? 1,
      ...params,
    }
    // Remove canonical param names not expected by Teamwave
    delete mergedParams['limit']

    const res = await request<TeamwaveListResponse<T>>(
      'GET',
      path,
      this.credentials,
      mergedParams,
    )

    const items = res.data ?? []
    const meta = res.meta
    const currentPage = meta?.current_page ?? 1
    const totalPages = meta?.total_pages ?? 1

    return { items, hasMore: currentPage < totalPages }
  }

  async get<T>(path: string): Promise<T> {
    const res = await request<TeamwaveItemResponse<T>>('GET', path, this.credentials)
    return res.data
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<TeamwaveItemResponse<T>>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<TeamwaveItemResponse<T>>(
      'PUT',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<unknown>('DELETE', path, this.credentials)
  }
}
