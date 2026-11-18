import type { Credentials } from '@opensteward/shared'
import { DEFAULT_INSTANCE_URL, DEFAULT_PAGE_SIZE } from './constants'

// SuiteCRM: OAuth2 or API key. REST API v8 at /api/v8/
// Base URL from credentials.extra.instanceUrl with fallback to demo

async function request<T>(
  method: string,
  path: string,
  accessToken: string,
  baseUrl: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}/api/v8${path}`)
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
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`SuiteCRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

// JSON:API response types
interface JsonApiDocument<T> {
  data?: T | T[]
  included?: unknown[]
  meta?: { total?: number }
}

interface JsonApiResource {
  id?: string
  type?: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, unknown>
}

export class SuiteCrmClient {
  private accessToken: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.accessToken = credentials.accessToken
    this.baseUrl = (credentials.extra?.['instanceUrl'] as string | undefined) ?? DEFAULT_INSTANCE_URL
  }

  async list<T>(module: string, params: Record<string, unknown> = {}): Promise<{ items: T[] }> {
    const pageSize = Number(params['pageSize'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const res = await request<JsonApiDocument<JsonApiResource>>(
      'GET', `/modules/${module}`, this.accessToken, this.baseUrl,
      { 'page[size]': pageSize, 'page[number]': page },
    )
    const data = Array.isArray(res?.data) ? res.data : []
    return { items: data.map(r => this.flattenResource(r)) as unknown as T[] }
  }

  async get<T>(module: string, id: string): Promise<T> {
    const res = await request<JsonApiDocument<JsonApiResource>>(
      'GET', `/modules/${module}/${id}`, this.accessToken, this.baseUrl,
    )
    const resource = Array.isArray(res?.data) ? res.data[0] : res?.data
    return this.flattenResource(resource ?? {}) as unknown as T
  }

  async post<T>(module: string, attributes: Record<string, unknown>): Promise<T> {
    const body = { data: { type: module, attributes } }
    const res = await request<JsonApiDocument<JsonApiResource>>(
      'POST', `/modules/${module}`, this.accessToken, this.baseUrl, undefined, body,
    )
    const resource = Array.isArray(res?.data) ? res.data[0] : res?.data
    return this.flattenResource(resource ?? {}) as unknown as T
  }

  async put<T>(module: string, id: string, attributes: Record<string, unknown>): Promise<T> {
    const body = { data: { type: module, id, attributes } }
    const res = await request<JsonApiDocument<JsonApiResource>>(
      'PATCH', `/modules/${module}/${id}`, this.accessToken, this.baseUrl, undefined, body,
    )
    const resource = Array.isArray(res?.data) ? res.data[0] : res?.data
    return this.flattenResource(resource ?? {}) as unknown as T
  }

  async delete(module: string, id: string): Promise<void> {
    await request<void>('DELETE', `/modules/${module}/${id}`, this.accessToken, this.baseUrl)
  }

  private flattenResource(resource: JsonApiResource): Record<string, unknown> {
    return {
      id: resource.id,
      ...resource.attributes,
    }
  }
}
