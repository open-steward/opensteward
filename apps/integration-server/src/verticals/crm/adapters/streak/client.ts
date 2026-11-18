import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

interface StreakListResponse<T> {
  results?: T[]
  // Streak sometimes returns an array directly
  [key: string]: unknown
}

function authHeader(credentials: Credentials): string {
  // credentials.accessToken holds base64(apiKey:) — use directly as Basic token
  return `Basic ${credentials.accessToken}`
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
      'Authorization': authHeader(credentials),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Streak API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // DELETE returns 200 with empty body or a simple object
  if (method === 'DELETE') {
    return {} as T
  }

  return res.json() as Promise<T>
}

export class StreakClient {
  constructor(private credentials: Credentials) {}

  /**
   * List endpoint — Streak returns an array directly (no envelope) for most
   * list endpoints, but some answer `{ results: [], hasNextPage }`.
   * `hasNextPage` is returned when the envelope carries it.
   *
   * `defaultLimit: false` sends no `limit` the caller did not pass, for
   * endpoints that document none (e.g. `GET /pipelines`).
   */
  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
    options: { defaultLimit?: boolean } = {},
  ): Promise<{ items: T[]; hasNextPage?: boolean }> {
    const mergedParams: Record<string, unknown> =
      options.defaultLimit === false
        ? { ...params }
        : { limit: params['limit'] ?? DEFAULT_PAGE_SIZE, ...params }

    const raw = await request<T[] | StreakListResponse<T>>(
      'GET',
      path,
      this.credentials,
      mergedParams,
    )

    let items: T[]
    let hasNextPage: boolean | undefined
    if (Array.isArray(raw)) {
      items = raw
    } else if (raw && typeof raw === 'object' && 'results' in raw && Array.isArray(raw.results)) {
      items = (raw as StreakListResponse<T>).results as T[]
      if (typeof raw['hasNextPage'] === 'boolean') hasNextPage = raw['hasNextPage']
    } else {
      items = []
    }

    return hasNextPage === undefined ? { items } : { items, hasNextPage }
  }

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.credentials)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<unknown>('DELETE', path, this.credentials)
  }
}
