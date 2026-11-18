import type { Credentials } from '@opensteward/shared'

/**
 * HTTP client for one SuperOffice tenant's REST WebAPI.
 *
 * The base is `credentials.extra.instanceUrl`: the id_token's `webapi_url`
 * claim ("The URL to a tenant REST web services.", e.g.
 * `https://sod.superoffice.com/Cust26759/api/`) plus `v1`, stored at token
 * exchange. A tenant lives at its own host and customer path, so there is no
 * fallback host: a connection without one has to reconnect.
 */
async function request<T>(method: string, url: URL, token: string, body?: unknown): Promise<T> {
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`SuperOffice API error ${res.status}: ${detail}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

/**
 * One page of an OData get-all. The operations return
 * `SuperOffice.Services.WebApi.OData.ODataSlimResponse` — "Easy to use archive
 * results - just a flat list of values." — with properties `odata.metadata`,
 * `odata.nextLink` and `value` (openapi-v3-Person.json and siblings).
 */
export interface ODataPage {
  rows: Record<string, unknown>[]
  nextLink: string | undefined
}

export class SuperofficeClient {
  private token: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    const base = credentials.extra?.['instanceUrl']
    if (typeof base !== 'string' || !/^https:\/\//.test(base)) {
      throw Object.assign(
        new Error(
          'SuperOffice connection has no tenant WebAPI URL (the id_token webapi_url claim); reconnect it.',
        ),
        { statusCode: 401 },
      )
    }
    this.token = credentials.accessToken
    this.baseUrl = base.replace(/\/+$/, '')
  }

  private url(path: string, params?: Record<string, unknown>): URL {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
    return url
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', this.url(path, params), this.token)
  }

  async odata(path: string, params: Record<string, unknown>): Promise<ODataPage> {
    const res = await request<Record<string, unknown> | null>(
      'GET',
      this.url(path, params),
      this.token,
    )
    const value = res?.['value']
    if (!Array.isArray(value)) {
      throw new Error(`SuperOffice ${path}: response has no OData "value" array`)
    }
    const next = res?.['odata.nextLink']
    return {
      rows: value as Record<string, unknown>[],
      nextLink: typeof next === 'string' && next !== '' ? next : undefined,
    }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', this.url(path), this.token, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', this.url(path), this.token, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', this.url(path), this.token)
  }
}
