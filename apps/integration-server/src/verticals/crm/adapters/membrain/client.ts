/**
 * Membrain REST API v2 client.
 *
 * Source: https://www.membrain.com/developers/api-documentation (fetched 2026-09-25).
 *
 *   Entry Point: "https://*.membrain.com/API/v2/"
 *   Authentication: "Authentication with the API is done by passing
 *   ?APIKey=xxxx to all requests ... If you prefer, you may instead pass the
 *   APIKey in a Request Header named APIKey."
 *   Paging: "Any paged collection will be contained in a root node which
 *   contains: count, from & to. ... When to matches count you are at the end
 *   of the paged set. To get to the next page, you can simply pass to in your
 *   next request."
 *
 * The key goes in the `APIKey` header, never the query string, so it stays
 * out of URLs and logs.
 */
import type { Credentials } from '@opensteward/shared'
import { API_PATH, MEMBRAIN_DOMAIN } from './constants'

/** One DNS label: the `*` of https://*.membrain.com. */
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

/**
 * The instance host for a connection, from `credentials.extra.subdomain`.
 * A connection made before the rebuild has none, and refuses before any
 * request: the docs give no shared API host.
 */
export function membrainHost(credentials: Credentials): string {
  const raw = (credentials.extra as Record<string, unknown> | undefined)?.['subdomain']
  const subdomain = typeof raw === 'string' ? raw.trim() : ''
  if (!SUBDOMAIN.test(subdomain)) {
    throw Object.assign(
      new Error(
        'Membrain needs the instance subdomain (the * in https://*.membrain.com/API/v2/): ' +
          'reconnect and enter it',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  return `${subdomain.toLowerCase()}.${MEMBRAIN_DOMAIN}`
}

/** A documented root-node number ("count": "1"); anything else is absent. */
function numeric(v: unknown): number | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined
  if (typeof v === 'string' && v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** A 200 body that is not the documented shape: an upstream fault, not data. */
export function offContract(path: string, expected: string): Error {
  return Object.assign(new Error(`Membrain ${path}: response is not ${expected}`), {
    statusCode: 502,
  })
}

/** A documented paged collection: `count`, `from`, `to` arrive as strings. */
export interface MembrainPage<T> {
  count: number
  from: number
  to: number
  items: T[]
}

export class MembrainClient {
  readonly host: string
  private readonly baseUrl: string

  constructor(private readonly credentials: Credentials) {
    this.host = membrainHost(credentials)
    this.baseUrl = `https://${this.host}${API_PATH}`
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v))

    const res = await fetch(url.toString(), {
      method,
      headers: {
        APIKey: this.credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Membrain API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }

    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  /**
   * One page of a paged collection, starting at row `From`. A body that
   * names an `error` (an unknown instance answers 200 with {"error":
   * "Instance not found"}) throws, and so does one without the documented
   * root node ("count, from & to" and `items`): read as an empty last page,
   * it would tell a sync the collection is complete.
   */
  async page<T>(path: string, params: Record<string, string | number>): Promise<MembrainPage<T>> {
    const res = this.checked(path, await this.request<unknown>('GET', path, params))
    const body = (res && typeof res === 'object' ? res : {}) as Record<string, unknown>
    const items = body['items']
    const count = numeric(body['count'])
    const from = numeric(body['from'])
    const to = numeric(body['to'])
    if (!Array.isArray(items) || count === undefined || from === undefined || to === undefined) {
      throw offContract(path, 'a paged collection (count, from, to, items)')
    }
    return { count, from, to, items: items as T[] }
  }

  /** Throw on a 200 body that reports an error instead of data. */
  private checked(path: string, res: unknown): unknown {
    if (res && typeof res === 'object' && !Array.isArray(res) && 'error' in res) {
      const error = (res as Record<string, unknown>)['error']
      throw Object.assign(new Error(`Membrain ${path}: ${String(error)}`), { statusCode: 502 })
    }
    return res
  }

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    return this.checked(path, await this.request<T>('GET', path, params)) as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}
