import type { Credentials } from '@opensteward/shared'

/**
 * HTTP client for the REST API published on Efficy's help.efficy.cloud as
 * "Maxo API" ("A Public API for interacting with Maxo."), OpenAPI 3.0.2 at
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml. Its server
 * host, efficytest.cloud, and efficy.cloud both redirect to www.efficy.com.
 * This is the cloud (Maxo) product's API, not Efficy Enterprise's /crm/json
 * RPC; which product this adapter targets is recorded as an open decision.
 *
 * Host — the spec's only server is a per-customer one:
 *   servers:
 *   - url: https://customer-name.efficytest.cloud
 * so there is no shared default host: the customer's URL is collected on the
 * Connect form and stored in `credentials.extra.instanceUrl`, and a connection
 * without it is refused rather than sent to a guessed host.
 *
 * Auth — from the spec's description:
 *   "Once created, copy the key and include it in the `X-Api-Key` header in all
 *    API requests."
 */
async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  baseUrl: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`)
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
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Efficy API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

/**
 * The documented list envelope (e.g. `GET /api/v1/companies`, 200 response):
 *   records_found: integer, next: string ("Next page of records"),
 *   previous: string, data: array
 */
export interface EfficyListResponse<T> {
  records_found?: number
  next?: string | null
  previous?: string | null
  data?: T[]
}

export class EfficyClient {
  private apiKey: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    const instanceUrl = credentials.extra?.['instanceUrl']
    if (typeof instanceUrl !== 'string' || instanceUrl.trim() === '') {
      throw Object.assign(
        new Error(
          "Efficy connection has no instanceUrl (the site URL of the customer's Efficy instance); reconnect to add it.",
        ),
        { statusCode: 400, code: 'MISSING_INSTANCE_URL' },
      )
    }
    this.apiKey = credentials.accessToken
    this.baseUrl = instanceUrl.trim().replace(/\/+$/, '')
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiKey, this.baseUrl, params)
  }

  /** One page of a list endpoint: `offset` + `limit` + `order_by`, all documented query parameters. */
  async list<T>(
    path: string,
    params: { offset: number; limit: number; order_by?: string },
  ): Promise<{ items: T[]; next: string | undefined }> {
    const res = await request<EfficyListResponse<T>>('GET', path, this.apiKey, this.baseUrl, params)
    return {
      items: Array.isArray(res?.data) ? res.data : [],
      next: typeof res?.next === 'string' && res.next !== '' ? res.next : undefined,
    }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, this.baseUrl, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.apiKey, this.baseUrl, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey, this.baseUrl)
  }
}
