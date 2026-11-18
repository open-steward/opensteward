import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

// Recruit CRM: Bearer token auth
// Authorization: Bearer <token>
// Base URL: https://api.recruitcrm.io/v1/
// Docs: https://docs.recruitcrm.io/

async function request<T>(
  method: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)

  if (method === 'GET' && params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Recruit CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class RecruitCrmClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  /**
   * One page of a documented paged list: `page` ("Page Number for
   * Pagination") and `limit` ("Limit of records per page. (Max:100)"). The
   * Laravel envelope carries no total; `next_page_url` is null on the last page.
   */
  async listPage<T>(
    path: string,
    page: number,
    limit: number,
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const res = await request<{ data?: T[]; next_page_url?: string | null }>(
      'GET',
      path,
      this.token,
      { page, limit },
    )
    return {
      items: res?.data ?? [],
      hasMore: res?.next_page_url != null && res.next_page_url !== '',
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await request<{ data?: T }>('GET', path, this.token, params)
    return (res?.data ?? res) as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T }>('POST', path, this.token, undefined, body)
    return (res?.data ?? res) as T
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T }>('PUT', path, this.token, undefined, body)
    return (res?.data ?? res) as T
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token)
  }
}
