import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH, DEFAULT_MAX_NUM } from './constants'
import { normaliseInstanceUrl } from './auth'

export interface SugarListResponse<T> {
  records: T[]
  next_offset: number
}

/**
 * The instance stored with the credentials at login, re-normalised: the bearer
 * token is sent there, so a missing or malformed value throws a readable error
 * instead of producing a request.
 */
function baseUrl(credentials: Credentials): string {
  const stored = credentials.extra?.['instanceUrl']
  return `${normaliseInstanceUrl(typeof stored === 'string' ? stored : undefined)}${API_BASE_PATH}`
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const fullUrl = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        fullUrl.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(fullUrl.toString(), {
    method,
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`SugarCRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res.json() as Promise<T>
}

export class SugarCrmClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    module: string,
    fields: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; nextOffset: number }> {
    const base = baseUrl(this.credentials)
    const res = await request<SugarListResponse<T>>(
      'GET',
      `${base}/${module}`,
      this.credentials,
      {
        fields,
        max_num: DEFAULT_MAX_NUM,
        ...params,
      },
    )
    return {
      items: res.records ?? [],
      nextOffset: res.next_offset,
    }
  }

  async get<T>(module: string, id: string, fields: string): Promise<T> {
    const base = baseUrl(this.credentials)
    return request<T>(
      'GET',
      `${base}/${module}/${id}`,
      this.credentials,
      { fields },
    )
  }

  async post<T>(module: string, body: unknown): Promise<T> {
    const base = baseUrl(this.credentials)
    return request<T>('POST', `${base}/${module}`, this.credentials, undefined, body)
  }

  async put<T>(module: string, id: string, body: unknown): Promise<T> {
    const base = baseUrl(this.credentials)
    return request<T>('PUT', `${base}/${module}/${id}`, this.credentials, undefined, body)
  }

  async delete(module: string, id: string): Promise<void> {
    const base = baseUrl(this.credentials)
    await request<unknown>('DELETE', `${base}/${module}/${id}`, this.credentials)
  }

  async getEnum<T>(module: string, field: string): Promise<T> {
    const base = baseUrl(this.credentials)
    return request<T>('GET', `${base}/${module}/enum/${field}`, this.credentials)
  }
}
