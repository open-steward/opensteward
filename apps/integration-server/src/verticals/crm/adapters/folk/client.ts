import type { Credentials } from '@opensteward/shared'
import { API_VERSION, BASE_URL } from './constants'

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, string | number | undefined>,
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
      // authentication.md: "include the API key in the `Authorization` header
      // using the bearer token scheme".
      Authorization: `Bearer ${credentials.accessToken}`,
      'X-API-Version': API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Folk API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  return res.json() as Promise<T>
}

/** The documented list envelope: `{ data: { items, pagination: { nextLink } } }`. */
interface FolkListResponse<T> {
  data: {
    items: T[]
    pagination: { nextLink?: string }
  }
}

/** The documented single-record envelope: `{ data: <record> }`. */
interface FolkItemResponse<T> {
  data: T
}

export class FolkClient {
  constructor(private credentials: Credentials) {}

  /**
   * One page of a list endpoint. pagination.md: "you can receive a
   * `pagination.nextLink` value ... pick the `cursor` parameter from the URL
   * and use it in the next request ... If there are no more pages of results,
   * the `pagination.nextLink` will be omitted from the response."
   */
  async list<T>(
    path: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<{ items: T[]; nextCursor: string | null }> {
    const res = await request<FolkListResponse<T>>('GET', path, this.credentials, {
      limit,
      cursor,
    })
    const nextLink = res.data.pagination.nextLink
    const nextCursor = nextLink ? new URL(nextLink).searchParams.get('cursor') : null
    return { items: res.data.items, nextCursor }
  }

  /** GET a single record and unwrap the documented `data` envelope. */
  async get<T>(path: string): Promise<T> {
    const res = await request<FolkItemResponse<T>>('GET', path, this.credentials)
    return res.data
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<Record<string, unknown>>('DELETE', path, this.credentials)
  }
}
