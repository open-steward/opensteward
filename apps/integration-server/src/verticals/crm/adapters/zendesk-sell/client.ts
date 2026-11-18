import type { Credentials } from '@opensteward/shared'

const BASE_URL = 'https://api.getbase.com/v2'

/** Single-item response envelope from Zendesk Sell. */
interface ZendeskSellItemResponse<T> {
  data: T
  meta?: Record<string, unknown>
}

/** List response envelope — items are `{ data: T, meta: {...} }[]`. */
interface ZendeskSellListResponse<T> {
  items: Array<{ data: T; meta?: Record<string, unknown> }>
  meta: {
    type: string
    count: number
    links: {
      self?: string
      next_page?: string | null
    }
  }
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
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify({ data: body }) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`ZendeskSell API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class ZendeskSellClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const res = await request<ZendeskSellListResponse<T>>(
      'GET',
      path,
      this.credentials,
      params,
    )
    const items = (res.items ?? []).map((i) => i.data)
    return {
      items,
      hasMore: !!res.meta?.links?.next_page,
    }
  }

  async get<T>(path: string): Promise<T> {
    const res = await request<ZendeskSellItemResponse<T>>(
      'GET',
      path,
      this.credentials,
    )
    if (!res.data) {
      throw Object.assign(new Error(`ZendeskSell: not found at ${path}`), { statusCode: 404 })
    }
    return res.data
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<ZendeskSellItemResponse<T>>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    if (!res.data) throw new Error(`ZendeskSell: POST ${path} returned no data`)
    return res.data
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<ZendeskSellItemResponse<T>>(
      'PUT',
      path,
      this.credentials,
      undefined,
      body,
    )
    if (!res.data) throw new Error(`ZendeskSell: PUT ${path} returned no data`)
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<unknown>('DELETE', path, this.credentials)
  }
}
