import type { Credentials } from '../../adapter/interface'
import { BASE_URL } from './constants'

interface CloseListResponse<T> {
  data: T[]
  has_more?: boolean
  /** Documented on opportunities only ("the total number of objects"). */
  total_results?: number
  cursor?: string | null
}

function basicAuth(credentials: Credentials): string {
  // Close uses HTTP Basic auth: apiKey as username, empty password
  const encoded = Buffer.from(`${credentials.accessToken}:`).toString('base64')
  return `Basic ${encoded}`
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
      'Authorization': basicAuth(credentials),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Close API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res.json() as Promise<T>
}

export class CloseClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean | undefined; totalResults: number | undefined }> {
    const res = await request<CloseListResponse<T>>('GET', path, this.credentials, params)
    return {
      items: res.data ?? [],
      hasMore: typeof res.has_more === 'boolean' ? res.has_more : undefined,
      totalResults: typeof res.total_results === 'number' ? res.total_results : undefined,
    }
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
    await request<unknown>('DELETE', path, this.credentials)
  }
}
