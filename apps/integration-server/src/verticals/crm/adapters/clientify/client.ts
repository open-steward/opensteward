import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

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
      Authorization: `Token ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Clientify API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class ClientifyClient {
  constructor(private credentials: Credentials) {}

  /**
   * One page of a documented list endpoint. Clientify's lists answer with
   * `{ "count": 2, "next": null, "previous": null, "results": [...] }`, and
   * `next` links carry the page number (`"next":
   * "https://api.clientify.net/v1/wall-entries/?page=2"`, List Wall
   * Entries; https://developer.clientify.com/). No page-size parameter is
   * documented, so only `page` is sent.
   */
  async page<T>(path: string, page: number): Promise<{ results: T[]; next: string | null }> {
    const res = await request<{ results?: unknown; next?: unknown }>(
      'GET',
      path,
      this.credentials,
      { page },
    )
    if (!Array.isArray(res?.results)) {
      throw Object.assign(new Error(`Clientify API error: GET ${path} returned no results array`), {
        statusCode: 502,
      })
    }
    return {
      results: res.results as T[],
      next: typeof res.next === 'string' && res.next !== '' ? res.next : null,
    }
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

  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
