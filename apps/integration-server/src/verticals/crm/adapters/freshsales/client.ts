import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

function apiKeyFrom(credentials: Credentials): string {
  return credentials.accessToken
}

/**
 * The API base is per customer. The Connect Link form stores the normalised
 * `extra.baseUrl`; connections built from deployment config carry only
 * `extra.domain` (the myfreshworks.com subdomain).
 */
function baseUrlFrom(credentials: Credentials): string {
  const extra = credentials.extra ?? {}
  const baseUrl = extra['baseUrl']
  if (typeof baseUrl === 'string' && baseUrl) return baseUrl
  const domain = extra['domain']
  if (typeof domain === 'string' && domain) return BASE_URL(domain)
  throw new Error(
    'Freshsales connection is missing its domain; reconnect it and enter your Freshsales domain.',
  )
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const base = baseUrlFrom(credentials)
  const url = new URL(`${base}${path}`)
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
      'Authorization': `Token token=${apiKeyFrom(credentials)}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Freshsales API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res.json() as Promise<T>
}

export class FreshsalesClient {
  constructor(private credentials: Credentials) {}

  /**
   * One page of GET /tasks for one filter: "The parameter filter is
   * mandatory." and "Only one filter is allowed at a time." `total` is the
   * response's `meta.total`, when it carries one.
   */
  async listTasks<T>(
    filter: 'open' | 'completed',
    page: number,
    perPage: number,
  ): Promise<{ items: T[]; total: number | undefined }> {
    const res = await request<Record<string, unknown>>(
      'GET',
      '/tasks',
      this.credentials,
      { filter, page, per_page: perPage },
    )
    const items = (res['tasks'] as T[] | undefined) ?? []
    const total = (res['meta'] as { total?: unknown } | undefined)?.total
    return { items, total: typeof total === 'number' ? total : undefined }
  }

  async get<T>(path: string): Promise<T> {
    const res = await request<{ [k: string]: T }>(
      'GET',
      path,
      this.credentials,
    )
    // The resource is returned as the first value of the response object
    const keys = Object.keys(res)
    if (keys.length === 0) {
      throw Object.assign(new Error(`Freshsales: not found at ${path}`), { statusCode: 404 })
    }
    return res[keys[0]!] as T
  }

  async post<T>(path: string, key: string, body: unknown): Promise<T> {
    const res = await request<{ [k: string]: T }>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res[key] as T
  }

  async put<T>(path: string, key: string, body: unknown): Promise<T> {
    const res = await request<{ [k: string]: T }>(
      'PUT',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res[key] as T
  }

  async delete(path: string): Promise<void> {
    await request<Record<string, unknown>>(
      'DELETE',
      path,
      this.credentials,
    )
  }
}
