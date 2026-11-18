import type { Credentials } from '@opensteward/shared'
import { GROOVE_BASE_URL, GROOVE_DEFAULT_PAGE_SIZE, GROOVE_MAX_PAGE_SIZE } from './constants'

/**
 * Groove REST v1 paginated list response shape.
 * The root key varies per resource (e.g. "customers", "tickets").
 * The `meta.pagination` block is present on every list endpoint.
 */
export interface GrooveListMeta {
  pagination: {
    current_page: number
    total_pages: number
    total_count: number
    next_page: string | null
  }
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${GROOVE_BASE_URL}${path}`)
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
      new Error(`Groove API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

/**
 * Groove REST v1 client.
 *
 * Pagination is page-number based (`page` / `per_page`).  The adapter maps
 * the canonical `cursor` / `limit` QueryParams to those fields.
 */
export class GrooveSalesClient {
  constructor(private credentials: Credentials) {}

  /**
   * Fetch one page of a list resource.
   * @param path   e.g. `/customers`
   * @param resourceKey  root key in the response JSON (e.g. `"customers"`)
   * @param page   1-based page number (default 1)
   * @param perPage  max 50 (Groove hard cap)
   */
  async listPage<T>(
    path: string,
    resourceKey: string,
    page = 1,
    perPage: number = GROOVE_DEFAULT_PAGE_SIZE,
  ): Promise<{ items: T[]; totalPages: number; nextPage: number | undefined }> {
    const per_page = Math.min(perPage, GROOVE_MAX_PAGE_SIZE)
    const res = await request<Record<string, unknown>>(
      'GET',
      path,
      this.credentials,
      { page, per_page },
    )

    const items = (res[resourceKey] as T[] | undefined) ?? []
    const meta = res['meta'] as GrooveListMeta | undefined
    const totalPages = meta?.pagination.total_pages ?? 1
    const nextPage = meta?.pagination.next_page != null ? page + 1 : undefined

    return { items, totalPages, nextPage }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.credentials, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
