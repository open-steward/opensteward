import type { Credentials } from '@opensteward/shared'

/**
 * Pipedrive's API host. Both OpenAPI specs name it as their server:
 * v1 "https://api.pipedrive.com/v1", v2 "https://api.pipedrive.com/api/v2"
 * (https://developers.pipedrive.com/docs/api/v1/openapi.yaml,
 *  https://developers.pipedrive.com/docs/api/v2/openapi.yaml).
 *
 * An OAuth connection is served from its own company domain instead: the
 * token response carries `api_domain`, "The base URL path, including the
 * `company_domain`, where the requests can be sent to."
 * (https://pipedrive.readme.io/docs/marketplace-oauth-authorization). The
 * adapter keeps it in `credentials.extra.apiDomain`; a connection made before
 * that was recorded uses this host until its next token refresh records it.
 */
export const DEFAULT_API_HOST = 'https://api.pipedrive.com'

/** v1 prefix — the v1 spec's server path. Only notes and writes still use it. */
const V1 = '/v1'
/** "Only `/api/v2/...` prefix is supported." — the v2 migration guide. */
const V2 = '/api/v2'

/**
 * How a request proves who it is.
 *
 * - `api_token`: "The API token must be provided in the `x-api-token` header
 *   for all requests" (https://pipedrive.readme.io/docs/core-api-concepts-authentication).
 * - `oauth`: "provide the `access_token` in every request in the
 *   `Authorization` header" as `Authorization: Bearer <token>`
 *   (https://pipedrive.readme.io/docs/marketplace-oauth-authorization).
 *
 * The token used to ride in an `api_token` query parameter for both, which
 * the current docs do not describe and which put it in every request URL.
 */
export type PipedriveAuthMode = 'api_token' | 'oauth'

interface PipedriveV1ListResponse<T> {
  success: boolean
  data: T[] | null
  additional_data?: {
    pagination?: {
      start: number
      limit: number
      more_items_in_collection: boolean
      next_start?: number
    }
  }
}

/**
 * A v2 list response: `data` plus `additional_data.next_cursor`, "The first
 * item on the next page. The value of the `next_cursor` field will be `null`
 * if you have reached the end of the dataset and there's no more pages to be
 * returned."
 */
interface PipedriveV2ListResponse<T> {
  success: boolean
  data: T[] | null
  additional_data?: { next_cursor?: string | null }
}

interface PipedriveItemResponse<T> {
  success: boolean
  data: T | null
}

/** The host a connection's requests go to: its recorded `api_domain`, else the spec server. */
export function apiHost(credentials: Credentials): string {
  const recorded = credentials.extra?.['apiDomain']
  if (typeof recorded === 'string' && recorded) {
    const url = new URL(recorded)
    if (url.protocol !== 'https:') {
      throw new Error(`Pipedrive: api_domain must be an https URL, got ${url.protocol}`)
    }
    return url.origin
  }
  return DEFAULT_API_HOST
}

export class PipedriveClient {
  constructor(
    private credentials: Credentials,
    private mode: PipedriveAuthMode,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${apiHost(this.credentials)}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }
    const token = this.credentials.accessToken
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.mode === 'api_token'
          ? { 'x-api-token': token }
          : { Authorization: `Bearer ${token}` }),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Pipedrive API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }

    return res.json() as Promise<T>
  }

  // ── v2 (cursor-paged) ─────────────────────────────────────────────────────

  /** One v2 list page. `nextCursor` is undefined at the end of the dataset. */
  async listV2<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<{ items: T[]; nextCursor: string | undefined }> {
    const res = await this.request<PipedriveV2ListResponse<T>>('GET', `${V2}${path}`, params)
    return {
      items: res.data ?? [],
      nextCursor: res.additional_data?.next_cursor ?? undefined,
    }
  }

  async getV2<T>(path: string): Promise<T> {
    const res = await this.request<PipedriveItemResponse<T>>('GET', `${V2}${path}`)
    if (!res.data) {
      throw Object.assign(new Error(`Pipedrive: not found at ${path}`), { statusCode: 404 })
    }
    return res.data
  }

  // ── v1 (offset-paged; notes and writes) ───────────────────────────────────

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean | undefined; nextStart?: number }> {
    const res = await this.request<PipedriveV1ListResponse<T>>('GET', `${V1}${path}`, params)
    const items = res.data ?? []
    const pagination = res.additional_data?.pagination
    return {
      items,
      // undefined when the response carries no pagination object: unknown, not "end".
      hasMore: pagination?.more_items_in_collection,
      nextStart: pagination?.next_start,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.request<PipedriveItemResponse<T>>('GET', `${V1}${path}`, params)
    if (!res.data) {
      throw Object.assign(new Error(`Pipedrive: not found at ${path}`), { statusCode: 404 })
    }
    return res.data
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request<PipedriveItemResponse<T>>(
      'POST',
      `${V1}${path}`,
      undefined,
      body,
    )
    if (!res.data) throw new Error(`Pipedrive: POST ${path} returned no data`)
    return res.data
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request<PipedriveItemResponse<T>>('PUT', `${V1}${path}`, undefined, body)
    if (!res.data) throw new Error(`Pipedrive: PUT ${path} returned no data`)
    return res.data
  }

  async delete(path: string): Promise<void> {
    await this.request<{ success: boolean }>('DELETE', `${V1}${path}`)
  }
}
