import type { Credentials } from '@opensteward/shared'
import { ZOHO_DEFAULT_BASE_URL } from './constants'

interface ZohoListResponse<T> {
  data: T[]
  info?: {
    more_records: boolean
    page: number
    per_page: number
    count: number
  }
}

interface ZohoItemResponse<T> {
  data: T[]
}

interface ZohoPipelineResponse<T> {
  pipeline?: T[]
}

/** `{"layouts": [...]}` — https://www.zoho.com/crm/developer/docs/api/v8/layouts-meta.html */
interface ZohoLayoutsResponse {
  layouts?: { id: string }[]
}

function baseUrlFrom(credentials: Credentials): string {
  const extra = credentials.extra as Record<string, unknown> | undefined
  return typeof extra?.['apiBaseUrl'] === 'string' ? extra['apiBaseUrl'] : ZOHO_DEFAULT_BASE_URL
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
    throw Object.assign(new Error(`Zoho CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class ZohoCrmClient {
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
    const res = await request<ZohoListResponse<T>>(
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

  async get<T>(module: string, id: string): Promise<T> {
    const res = await request<ZohoItemResponse<T>>(
      'GET',
      this.url(`/${module}/${id}`),
      this.credentials,
    )
    const item = res.data?.[0]
    if (item == null) {
      throw Object.assign(new Error(`Zoho CRM: not found — ${module}/${id}`), { statusCode: 404 })
    }
    return item
  }

  async post<T>(module: string, record: Record<string, unknown>): Promise<T> {
    const res = await request<ZohoItemResponse<T>>(
      'POST',
      this.url(`/${module}`),
      this.credentials,
      undefined,
      { data: [record] },
    )
    const item = res.data?.[0]
    if (item == null) throw new Error(`Zoho CRM: POST ${module} returned no data`)
    return item
  }

  async put<T>(module: string, id: string, record: Record<string, unknown>): Promise<T> {
    const res = await request<ZohoItemResponse<T>>(
      'PUT',
      this.url(`/${module}/${id}`),
      this.credentials,
      undefined,
      { data: [record] },
    )
    const item = res.data?.[0]
    if (item == null) throw new Error(`Zoho CRM: PUT ${module}/${id} returned no data`)
    return item
  }

  async delete(module: string, id: string): Promise<void> {
    await request<void>('DELETE', this.url(`/${module}/${id}`), this.credentials)
  }

  /**
   * Ids of every layout of a module. GET /settings/layouts?module={module} —
   * "module string, mandatory"; the endpoint documents no paging parameters.
   * https://www.zoho.com/crm/developer/docs/api/v8/layouts-meta.html
   */
  async listLayoutIds(module: string): Promise<string[]> {
    const res = await request<ZohoLayoutsResponse | undefined>(
      'GET',
      this.url('/settings/layouts'),
      this.credentials,
      { module },
    )
    return (res?.layouts ?? []).map((l) => String(l.id))
  }

  /**
   * Every pipeline of one Deals layout. GET /settings/pipeline?layout_id={id} —
   * "layout_id string, mandatory"; the response is a bare `{"pipeline": [...]}`
   * with no paging keys, and a layout with no pipeline answers 204 NO_CONTENT
   * ("you have not created a pipeline in that layout").
   * https://www.zoho.com/crm/developer/docs/api/v8/get-pipelines.html
   */
  async listPipelines<T>(layoutId: string): Promise<T[]> {
    const res = await request<ZohoPipelineResponse<T> | undefined>(
      'GET',
      this.url('/settings/pipeline'),
      this.credentials,
      { layout_id: layoutId },
    )
    return res?.pipeline ?? []
  }
}
