import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

async function request<T>(
  method: string,
  path: string,
  token: string,
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
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Sellsy API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

/**
 * A Sellsy v2 list response: `{ pagination, data }`, both required. The
 * `Pagination` schema requires `limit`, `total`, `count` and `offset`;
 * under the default "seek" method `offset` is a string that "represents the
 * LAST object in the response list".
 * https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml
 */
export interface SellsyPage<T> {
  data: T[]
  pagination: { limit: number; total: number; count: number; offset: number | string }
}

export class SellsyClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.token, params)
  }

  async list<T>(path: string, params: Record<string, unknown> = {}): Promise<{ items: T[] }> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const offset = Number(params['offset'] ?? 0)
    const queryParams = { ...params, limit, offset }

    const res = await request<{ data: T[] }>('GET', path, this.token, queryParams)

    return { items: res.data ?? [] }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.token, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.token, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token)
  }
}
