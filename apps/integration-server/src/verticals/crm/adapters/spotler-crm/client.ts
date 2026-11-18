import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

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
    throw Object.assign(new Error(`Spotler CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  // A single-record GET may answer with "nothing" (see getRecord), so an empty
  // body is returned as undefined instead of failing inside JSON parsing.
  const text = await res.text()
  return (text.trim() === '' ? undefined : JSON.parse(text)) as T
}

/**
 * The documented list response (https://support.reallysimplesystems.com/api-v4/,
 * "GET Your Accounts"): `{ metadata: { url, object_type, total_count,
 * has_more }, list: [{ metadata, record }] }`.
 */
interface ListResponse<T> {
  metadata: { has_more: boolean; total_count?: number }
  list: { record: T }[]
}

/** The documented single-record response: `{ metadata, record }`. */
interface RecordResponse<T> {
  record: T
}

export class SpotlerCrmClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  /**
   * One record, out of its `{ metadata, record }` envelope. The docs: "GET
   * /{object_name}/12345 Above will return the record which has the ID of
   * 12345 or nothing." A response with no record is therefore a not-found.
   */
  async getRecord<T>(path: string): Promise<T> {
    const res = await request<RecordResponse<T> | undefined>('GET', path, this.token)
    if (res == null || res.record == null) {
      throw Object.assign(new Error(`Spotler CRM ${path} not found`), { statusCode: 404 })
    }
    return res.record
  }

  /**
   * One upstream page. `page` is the platform's own page number, which counts
   * from 0 (see `listPage` in index.ts); `limit` is at most 100.
   */
  async list<T>(
    path: string,
    params: { page: number; limit: number },
  ): Promise<{ records: T[]; hasMore: boolean }> {
    const res = await request<ListResponse<T>>('GET', path, this.token, params)
    if (!res || !Array.isArray(res.list) || typeof res.metadata?.has_more !== 'boolean') {
      throw Object.assign(
        new Error(
          `Spotler CRM ${path} returned no documented { metadata.has_more, list } envelope`,
        ),
        { statusCode: 502 },
      )
    }
    return { records: res.list.map((entry) => entry.record), hasMore: res.metadata.has_more }
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
