import type { Credentials } from '@opensteward/shared'
import { BIGIN_DEFAULT_BASE_URL } from './constants'

interface BiginListResponse<T> {
  data: T[]
  info?: {
    more_records: boolean
    page: number
    per_page: number
  }
}

interface BiginItemResponse<T> {
  data: T[]
}

function baseUrlFrom(credentials: Credentials): string {
  const extra = credentials.extra as Record<string, unknown> | undefined
  return typeof extra?.['apiBaseUrl'] === 'string' ? extra['apiBaseUrl'] : BIGIN_DEFAULT_BASE_URL
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
      Authorization: `Zoho-oauthtoken ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Zoho Bigin API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class ZohoBiginClient {
  private baseUrl: string

  constructor(private credentials: Credentials) {
    this.baseUrl = baseUrlFrom(credentials)
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  async list<T>(
    module: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const res = await request<BiginListResponse<T>>(
      'GET',
      this.url(`/${module}`),
      this.credentials,
      params,
    )
    return {
      items: res.data ?? [],
      hasMore: res.info?.more_records ?? false,
    }
  }

  /**
   * GET /settings/layouts?module={module_api_name}: every layout of a module,
   * under the `layouts` key, unpaged; `module` is its only parameter
   * (https://www.bigin.com/developer/docs/apis/v2/layouts-meta-data.html).
   * Bigin answers a GET for data that does not exist with 204 No Content
   * (https://www.bigin.com/developer/docs/apis/v2/status-codes.html).
   */
  async layouts<T>(module: string): Promise<T[]> {
    const res = await request<{ layouts?: T[] } | undefined>(
      'GET',
      this.url('/settings/layouts'),
      this.credentials,
      { module },
    )
    return res?.layouts ?? []
  }

  async get<T>(module: string, id: string): Promise<T> {
    const res = await request<BiginItemResponse<T>>(
      'GET',
      this.url(`/${module}/${id}`),
      this.credentials,
    )
    const item = res.data?.[0]
    if (item == null) {
      throw Object.assign(new Error(`Zoho Bigin: not found — ${module}/${id}`), { statusCode: 404 })
    }
    return item
  }

  async post<T>(module: string, record: Record<string, unknown>): Promise<T> {
    const res = await request<BiginItemResponse<T>>(
      'POST',
      this.url(`/${module}`),
      this.credentials,
      undefined,
      { data: [record] },
    )
    const item = res.data?.[0]
    if (item == null) throw new Error(`Zoho Bigin: POST ${module} returned no data`)
    return item
  }

  async put<T>(module: string, id: string, record: Record<string, unknown>): Promise<T> {
    const res = await request<BiginItemResponse<T>>(
      'PUT',
      this.url(`/${module}/${id}`),
      this.credentials,
      undefined,
      { data: [record] },
    )
    const item = res.data?.[0]
    if (item == null) throw new Error(`Zoho Bigin: PUT ${module}/${id} returned no data`)
    return item
  }

  async delete(module: string, id: string): Promise<void> {
    await request<void>('DELETE', this.url(`/${module}/${id}`), this.credentials)
  }
}
