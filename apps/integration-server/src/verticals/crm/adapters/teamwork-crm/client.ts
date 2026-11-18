import type { Credentials } from '@opensteward/shared'
import { API_PATH } from './constants'

/**
 * Teamwork CRM API v2.
 *
 * The first-party docs (developer.teamwork.com/crm, now redirected to an
 * apidocs.teamwork.com page with no CRM content) survive only as Wayback
 * snapshots of the vendor's own site. From "Getting started"
 * (https://web.archive.org/web/20191122005536id_/https://developer.teamwork.com/crm/intro/getting-started):
 *
 * - "Copy the URL from your address bar (ignoring `/crm...`). This should be
 *   something like `https://example.teamwork.com`. If you're using a custom
 *   domain, it might be something like `https://projects.example.com`."
 * - "Almost all endpoints will start with `https://example.teamwork.com/crm/api/v2/`."
 * - "For all requests to our API, send the API key in the `Authorization`
 *   header; e.g. `Authorization: Bearer {{YOUR_API_KEY}}`."
 *
 * There is no shared API host: the site URL is per customer, so it comes from
 * the connection (`extra.siteUrl`, collected by the credential form), or from
 * a legacy `extra.subdomain` as `https://{subdomain}.teamwork.com`.
 */

async function request<T>(
  method: string,
  path: string,
  authHeader: string,
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
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Teamwork CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

function badResponse(message: string): Error {
  return Object.assign(new Error(`Teamwork CRM: ${message}`), { statusCode: 502 })
}

function missingSite(reason: string): Error {
  return Object.assign(
    new Error(
      `Teamwork CRM connection ${reason}: every endpoint starts with ` +
        'https://{your-site}.teamwork.com/crm/api/v2/ — reconnect with your site URL.',
    ),
    { statusCode: 400, code: 'MISSING_CREDENTIAL' },
  )
}

/**
 * The customer's site origin, e.g. `https://example.teamwork.com`. A stored
 * `extra.siteUrl` is held to the rule the credential form applies: an
 * https:// address, of which only the origin is kept.
 */
export function siteOrigin(credentials: Credentials): string {
  const siteUrl = credentials.extra?.['siteUrl']
  if (typeof siteUrl === 'string' && siteUrl.trim()) {
    let url: URL
    try {
      url = new URL(siteUrl.trim())
    } catch {
      throw missingSite('has a site URL that is not a URL')
    }
    if (url.protocol !== 'https:') throw missingSite('has a site URL that is not https://')
    return url.origin
  }
  const subdomain = credentials.extra?.['subdomain']
  if (typeof subdomain === 'string' && subdomain.trim()) {
    return `https://${subdomain.trim()}.teamwork.com`
  }
  throw missingSite('has no site URL')
}

/**
 * The pagination block every list response carries: "There is a `meta` root
 * property in the response, containing pagination metadata ... `count` is the
 * total number of entities."
 * (https://web.archive.org/web/20191121231823id_/https://developer.teamwork.com/crm/general/pagination)
 */
interface ListEnvelope {
  meta?: { page?: { count?: number; pageOffset?: number; pageSize?: number } } | null
  included?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface ListPage<T> {
  rows: T[]
  /** `meta.page.count`, when the platform sent it. */
  count: number | undefined
  /** The response's `included` side-load, keyed by entity type. */
  included: Record<string, unknown>
}

export class TeamworkCrmClient {
  private authHeader: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.authHeader = `Bearer ${credentials.accessToken}`
    this.baseUrl = `${siteOrigin(credentials)}${API_PATH}`
  }

  /** One page of a list endpoint; `key` is the documented array property (e.g. `deals`). */
  async listPage<T>(
    path: string,
    key: string,
    query: Record<string, unknown>,
  ): Promise<ListPage<T>> {
    const res = await request<ListEnvelope>('GET', path, this.authHeader, this.baseUrl, query)
    const rows = res?.[key]
    if (!Array.isArray(rows)) throw badResponse(`GET ${path} returned no '${key}' array`)
    const count = res.meta?.page?.count
    return {
      rows: rows as T[],
      count: typeof count === 'number' && Number.isFinite(count) ? count : undefined,
      included: res.included ?? {},
    }
  }

  /** A single-entity read; `key` is the documented object property (e.g. `deal`). */
  async getOne<T>(path: string, key: string): Promise<T> {
    const res = await request<Record<string, unknown>>('GET', path, this.authHeader, this.baseUrl)
    const entity = res?.[key]
    if (entity == null || typeof entity !== 'object') {
      throw badResponse(`GET ${path} returned no '${key}' object`)
    }
    return entity as T
  }

  // Write helpers below are unchanged from the original adapter; they are out
  // of the read rebuild's scope and still target undocumented paths.

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T } | T>(
      'POST',
      path,
      this.authHeader,
      this.baseUrl,
      undefined,
      body,
    )
    if (res && typeof res === 'object' && 'data' in res) {
      return (res as { data: T }).data
    }
    return res as T
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T } | T>(
      'PUT',
      path,
      this.authHeader,
      this.baseUrl,
      undefined,
      body,
    )
    if (res && typeof res === 'object' && 'data' in res) {
      return (res as { data: T }).data
    }
    return res as T
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.authHeader, this.baseUrl)
  }
}
