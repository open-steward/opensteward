import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'AuthenticationToken': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`weclapp API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class WeclappClient {
  private token: string
  private baseUrl: string

  /**
   * The tenant API base is per customer and lives on the connection
   * (`extra.instanceUrl`, set by the Connect Link form). There is deliberately
   * no fallback tenant: the API token must never be sent to someone else's.
   */
  constructor(credentials: Credentials) {
    const instanceUrl = credentials.extra?.['instanceUrl']
    if (typeof instanceUrl !== 'string' || !instanceUrl) {
      throw new Error(
        'weclapp connection is missing its tenant URL; reconnect it and enter your weclapp tenant.',
      )
    }
    this.token = credentials.accessToken
    this.baseUrl = instanceUrl
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const res = await request<{ result: T[] }>('GET', this.baseUrl, path, this.token, {
      pageSize: DEFAULT_PAGE_SIZE,
      page: 1,
      ...params,
    })
    return { items: res.result ?? [], hasMore: false }
  }

  get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', this.baseUrl, path, this.token, params)
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', this.baseUrl, path, this.token, undefined, body)
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', this.baseUrl, path, this.token, undefined, body)
  }

  delete(path: string): Promise<void> {
    return request<void>('DELETE', this.baseUrl, path, this.token)
  }
}
