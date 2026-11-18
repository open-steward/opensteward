import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

// Bullhorn uses BhRestToken as a query parameter on all API calls
// Base URL is tenant-specific from credentials.extra.instanceUrl

async function request<T>(
  method: string,
  path: string,
  restUrl: string,
  bhRestToken: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${restUrl}${path}`)
  url.searchParams.set('BhRestToken', bhRestToken)
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
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Bullhorn API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class BullhornClient {
  private restUrl: string
  private bhRestToken: string

  constructor(credentials: Credentials) {
    this.bhRestToken = credentials.accessToken
    this.restUrl = (credentials.extra?.['instanceUrl'] as string | undefined) ?? 'https://rest.bullhornstaffing.com/rest-services/BhRest'
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.restUrl, this.bhRestToken, params)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const count = Number(params['count'] ?? DEFAULT_PAGE_SIZE)
    const start = Number(params['start'] ?? 0)
    // Bullhorn requires a fields param — default to all common fields
    const fields = params['fields'] ?? 'id,firstName,lastName,email,phone,mobile,dateAdded,dateLastModified'
    const res = await request<{ data?: T[]; total?: number }>(
      'GET', path, this.restUrl, this.bhRestToken,
      { ...params, count, start, fields },
    )
    const items = res?.data ?? []
    return { items: Array.isArray(items) ? items : [] }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.restUrl, this.bhRestToken, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.restUrl, this.bhRestToken, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.restUrl, this.bhRestToken)
  }
}
