import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

export interface ApolloPagination {
  page: number
  per_page: number
  total_entries: number
  total_pages: number
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)

  if (method === 'GET' || method === 'DELETE') {
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v))
        }
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      // "Pass the key in the `x-api-key` header of every request."
      // (https://docs.apollo.io/reference/authentication.md). An `api_key` in
      // the query string or body is not read at all: Apollo answers 401
      // AUTH.AUTHENTICATION.CREDENTIALS_MISSING.
      'x-api-key': credentials.accessToken,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Apollo API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class ApolloClient {
  constructor(private credentials: Credentials) {}

  async listSearch<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; pagination: ApolloPagination | undefined }> {
    // The list key differs by resource — caller provides it via params.__listKey.
    // It names the response key, so it stays out of the request body.
    const { __listKey, ...rest } = params
    const body = {
      page: rest['page'] ?? 1,
      per_page: rest['per_page'] ?? DEFAULT_PAGE_SIZE,
      ...rest,
    }
    const res = await request<Record<string, unknown>>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    const listKey = String(__listKey ?? 'contacts')
    const items = (res[listKey] as T[]) ?? []
    // Only what Apollo sent: a made-up `total_pages: 1` would read as a last page.
    const pagination = res['pagination'] as ApolloPagination | undefined
    return { items, pagination }
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
