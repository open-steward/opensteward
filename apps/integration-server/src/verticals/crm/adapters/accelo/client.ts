/**
 * Accelo REST client.
 *
 * Accelo's REST API v0:
 *   - Base URL: https://{deployment}.api.accelo.com/api/v0
 *   - Auth: Bearer token in Authorization header
 *   - Pagination: _page (0-indexed), _limit (default 10, max 100)
 *   - Response: { meta: { status, message }, response: T | T[] }
 *   - Fields: requested via `_fields` query parameter
 */

import type { Credentials } from '@opensteward/shared'
import { acceloBaseUrl, DEFAULT_PAGE_SIZE } from './constants'
import { normaliseDeployment } from './auth'

/** Accelo list response envelope. */
interface AcceloListResponse<T> {
  meta: { status: string; message: string; more_info?: string }
  response: T[]
}

/** Accelo single-item response envelope. */
interface AcceloItemResponse<T> {
  meta: { status: string; message: string; more_info?: string }
  response: T
}

/**
 * Resolve the deployment stored in `credentials.extra.deployment` at token
 * exchange. Every Accelo request is per-tenant, and the bearer token is sent to
 * the host built from this value — so it is re-validated, and a missing or
 * foreign value throws a readable error rather than producing a request.
 */
function deploymentFrom(credentials: Credentials): string {
  const stored = credentials.extra?.['deployment']
  return normaliseDeployment(typeof stored === 'string' ? stored : undefined)
}

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  credentials: Credentials,
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
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Accelo API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class AcceloClient {
  private baseUrl: string

  constructor(private credentials: Credentials) {
    this.baseUrl = acceloBaseUrl(deploymentFrom(credentials))
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean; nextPage?: number }> {
    const page = (params['_page'] as number | undefined) ?? 0
    const limit = (params['_limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const merged = { _page: page, _limit: limit, ...params }

    const res = await request<AcceloListResponse<T>>(
      'GET',
      this.baseUrl,
      path,
      this.credentials,
      merged,
    )
    const items = res.response ?? []
    // Accelo doesn't return an explicit "has more" flag — if we got a full page there may be more
    const hasMore = items.length >= limit
    return {
      items,
      hasMore,
      nextPage: hasMore ? page + 1 : undefined,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await request<AcceloItemResponse<T>>(
      'GET',
      this.baseUrl,
      path,
      this.credentials,
      params,
    )
    return res.response
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<AcceloItemResponse<T>>(
      'POST',
      this.baseUrl,
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.response
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<AcceloItemResponse<T>>(
      'PUT',
      this.baseUrl,
      path,
      this.credentials,
      undefined,
      body,
    )
    return res.response
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', this.baseUrl, path, this.credentials)
  }
}
