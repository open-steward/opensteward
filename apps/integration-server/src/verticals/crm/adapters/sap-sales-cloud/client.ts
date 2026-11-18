/**
 * SAP Sales Cloud V2 HTTP client.
 *
 * All endpoints follow the pattern:
 *   https://<tenant>.crm.cloud.sap/sap/c4c/api/v1/<service>/<resource>
 *
 * Authentication: Bearer token in the Authorization header.
 * Pagination: $top / $skip query params; response has a `value` array and
 *   an optional `@odata.nextLink` for cursor-based navigation.
 */
import type { Credentials } from '@opensteward/shared'
import { SAP_SALES_CLOUD_API_BASE } from './constants'

/**
 * Standard OData V4-style collection response.
 * SAP Sales Cloud V2 wraps list results in `{ value: [...], "@odata.nextLink"?: "..." }`.
 */
interface SapListResponse<T> {
  value: T[]
  '@odata.count'?: number
  '@odata.nextLink'?: string
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const reqUrl = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        reqUrl.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(reqUrl.toString(), {
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
      new Error(`SAP Sales Cloud API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE / some PATCH responses
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class SapSalesCloudClient {
  private readonly apiBase: string

  constructor(
    private readonly tenantUrl: string,
    private readonly credentials: Credentials,
  ) {
    this.apiBase = `${tenantUrl}${SAP_SALES_CLOUD_API_BASE}`
  }

  /**
   * List resources with $top/$skip pagination.
   * Returns items and a flag indicating whether more pages exist.
   */
  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const url = `${this.apiBase}${path}`
    const res = await request<SapListResponse<T>>(
      'GET',
      url,
      this.credentials,
      params,
    )
    return {
      items: res.value ?? [],
      hasMore: res['@odata.nextLink'] != null,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${this.apiBase}${path}`
    return request<T>('GET', url, this.credentials, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.apiBase}${path}`
    return request<T>('POST', url, this.credentials, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.apiBase}${path}`
    return request<T>('PATCH', url, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    const url = `${this.apiBase}${path}`
    await request<void>('DELETE', url, this.credentials)
  }
}
