import type { Credentials } from '../../adapter/interface'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

/** JSON:API resource object */
export interface JsonApiResource<A extends Record<string, unknown> = Record<string, unknown>> {
  id: string | number
  type: string
  attributes: A
  relationships?: Record<string, {
    data?: { id: string | number; type: string } | Array<{ id: string | number; type: string }> | null
  }>
  [key: string]: unknown
}

interface JsonApiListResponse<A extends Record<string, unknown>> {
  data: JsonApiResource<A>[]
  links?: { next?: string | null }
  meta?: { count?: number }
}

interface JsonApiItemResponse<A extends Record<string, unknown>> {
  data: JsonApiResource<A>
}

function bearerFrom(credentials: Credentials): string {
  return credentials.accessToken
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
      'Authorization': `Bearer ${bearerFrom(credentials)}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Outreach API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class OutreachClient {
  constructor(private credentials: Credentials) {}

  async list<A extends Record<string, unknown>>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: JsonApiResource<A>[]; hasMore: boolean }> {
    const merged = {
      'page[size]': DEFAULT_PAGE_SIZE,
      ...params,
    }
    const res = await request<JsonApiListResponse<A>>(
      'GET',
      path,
      this.credentials,
      merged,
    )
    return {
      items: res.data ?? [],
      hasMore: !!(res.links?.next),
    }
  }

  async get<A extends Record<string, unknown>>(path: string): Promise<JsonApiResource<A>> {
    const res = await request<JsonApiItemResponse<A>>(
      'GET',
      path,
      this.credentials,
    )
    return res.data
  }

  async post<A extends Record<string, unknown>>(
    path: string,
    body: unknown,
  ): Promise<JsonApiResource<A>> {
    const res = await request<JsonApiItemResponse<A>>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async patch<A extends Record<string, unknown>>(
    path: string,
    body: unknown,
  ): Promise<JsonApiResource<A>> {
    const res = await request<JsonApiItemResponse<A>>(
      'PATCH',
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
