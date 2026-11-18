import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/**
 * 200 body of POST /contact/list: `{items: [Contact], pagination: {next, previous}}`,
 * `next` example "https://api.respond.io/contact/list?limit=10&cursorId=-10".
 */
export interface RespondIoContactListResponse<T> {
  items: T[]
  pagination?: { next?: string | null; previous?: string | null }
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
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Respond.io API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class RespondIoClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  /**
   * POST /contact/list — query `limit` and `cursorId`, body `filter`.
   * https://developers.respond.io/docs/api/0759d02787ab3-list-the-contacts
   */
  async listContacts<T>(
    query: { limit: number; cursorId?: string },
    body: unknown,
  ): Promise<RespondIoContactListResponse<T>> {
    return request<RespondIoContactListResponse<T>>(
      'POST',
      '/contact/list',
      this.apiKey,
      query,
      body,
    )
  }

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.apiKey)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.apiKey, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey)
  }
}
