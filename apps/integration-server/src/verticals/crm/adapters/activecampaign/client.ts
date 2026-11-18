import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

function baseUrl(credentials: Credentials): string {
  const account = credentials.extra?.['account'] as string | undefined
  if (!account) throw new Error('ActiveCampaign: credentials.extra.account is required')
  return `https://${account}.api-us1.com/api/3`
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl(credentials)}${path}`)
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
      'Api-Token': credentials.accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`ActiveCampaign API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res.json() as Promise<T>
}

export class ActiveCampaignClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    arrayKey: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; total: number | undefined }> {
    const merged = { limit: DEFAULT_PAGE_SIZE, offset: 0, ...params }
    const res = await request<Record<string, unknown>>(
      'GET',
      path,
      this.credentials,
      merged,
    )
    const items = (res[arrayKey] as T[] | undefined) ?? []
    const meta = res['meta'] as { total?: string | number } | undefined
    // meta.total is documented ("The total number of results in a collection
    // can be found in the `meta.total` property of the response."); absent or
    // unreadable, the total is unknown rather than the length of this page.
    const total = meta?.total != null && Number.isFinite(Number(meta.total)) ? Number(meta.total) : undefined
    return { items, total }
  }

  async get<T>(path: string, wrapKey: string): Promise<T> {
    const res = await request<Record<string, unknown>>(
      'GET',
      path,
      this.credentials,
    )
    const item = res[wrapKey] as T | undefined
    if (!item) {
      throw Object.assign(
        new Error(`ActiveCampaign: not found at ${path}`),
        { statusCode: 404 },
      )
    }
    return item
  }

  async post<T>(path: string, wrapKey: string, body: unknown): Promise<T> {
    const res = await request<Record<string, unknown>>(
      'POST',
      path,
      this.credentials,
      undefined,
      body,
    )
    const item = res[wrapKey] as T | undefined
    if (!item) throw new Error(`ActiveCampaign: POST ${path} returned no data`)
    return item
  }

  async put<T>(path: string, wrapKey: string, body: unknown): Promise<T> {
    const res = await request<Record<string, unknown>>(
      'PUT',
      path,
      this.credentials,
      undefined,
      body,
    )
    const item = res[wrapKey] as T | undefined
    if (!item) throw new Error(`ActiveCampaign: PUT ${path} returned no data`)
    return item
  }

  async delete(path: string): Promise<void> {
    await request<unknown>('DELETE', path, this.credentials)
  }

  async rawGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.credentials, params)
  }
}
