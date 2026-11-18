import type { Credentials } from '@opensteward/shared'

/**
 * Scoro API v2 client. Every quote below is from the first-party reference at
 * https://api.scoro.com/api/v2.
 *
 * Host: "The Scoro API has a single point of entry, derived from your account
 * URL" — "https://#companyname#.scoro.com/api/v2/#module#(/#action#)(/#id#)",
 * "where #companyname# is the subdomain".
 *
 * Transport: "All API requests are composed of light-weight JSON delivered as
 * an HTTP POST request to the endpoint URL." — including view requests.
 *
 * Auth: "All requests should contain at least the following values: apiKey OR
 * user_token - a unique key used for authentication; company_account_id -
 * specifies which business entity’s data is used".
 *
 * Errors: "All responses are wrapped in a top-level response element. The
 * status attribute will let you know whether the request succeeded or failed.
 * Status can be OK or ERROR." The documented error examples arrive as
 * "HTTP/1.1 200" with "status": "ERROR" and a "statusCode", so the HTTP status
 * alone cannot be trusted.
 */

/** The top-level response element. */
interface ScoroEnvelope {
  status?: string
  statusCode?: string | number
  messages?: unknown
  data?: unknown
}

/** A host label: the part before `.scoro.com`. */
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

function upstreamError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 502, code: 'UPSTREAM_ERROR' })
}

function envelopeMessage(env: ScoroEnvelope): string {
  const errors = (env.messages as { error?: unknown } | null | undefined)?.error
  return Array.isArray(errors) ? errors.map(String).join('; ') : 'unknown error'
}

export interface ScoroListRequest {
  /** 1-based page. */
  page: number
  /** Rows per page, already clamped to the documented 100. */
  perPage: number
  /** The documented "filter" object: field names as keys. */
  filter?: Record<string, unknown>
  /** Contents of the documented "request" object (default {}). */
  request?: Record<string, unknown>
  /** Further documented top-level body parameters. */
  params?: Record<string, unknown>
}

export class ScoroClient {
  private readonly apiKey: string
  private readonly companyAccountId: string
  private readonly baseUrl: string

  constructor(credentials: Credentials) {
    const extra = credentials.extra ?? {}
    const subdomain = extra['subdomain']
    const companyAccountId = extra['companyAccountId']
    if (typeof subdomain !== 'string' || !SUBDOMAIN.test(subdomain)) {
      throw Object.assign(
        new Error(
          'Scoro connection has no account subdomain (the "companyname" in companyname.scoro.com); reconnect it.',
        ),
        { statusCode: 400 },
      )
    }
    if (typeof companyAccountId !== 'string' || companyAccountId.trim() === '') {
      throw Object.assign(
        new Error(
          'Scoro connection has no company_account_id (Settings > External Connections > API); reconnect it.',
        ),
        { statusCode: 400 },
      )
    }
    this.apiKey = credentials.accessToken
    this.companyAccountId = companyAccountId
    this.baseUrl = `https://${subdomain.toLowerCase()}.scoro.com/api/v2/`
  }

  private async call(path: string, body: Record<string, unknown>): Promise<ScoroEnvelope> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        apiKey: this.apiKey,
        company_account_id: this.companyAccountId,
        ...body,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Scoro API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    const env = (await res.json()) as ScoroEnvelope
    if (env?.status === 'ERROR') {
      const code = Number(env.statusCode)
      throw Object.assign(
        new Error(`Scoro API error ${String(env.statusCode)}: ${envelopeMessage(env)}`),
        {
          statusCode: Number.isInteger(code) && code >= 400 ? code : 502,
        },
      )
    }
    return env
  }

  /**
   * POST {module}/list. "Sample request with per_page and page parameters":
   * { "apiKey", "lang", "company_account_id", "per_page": 50, "page": 2, …,
   * "request": {} }. "List results can be filtered by adding a filter object
   * to the request."
   */
  async list<T>(module: string, req: ScoroListRequest): Promise<T[]> {
    const env = await this.call(`${module}/list`, {
      ...(req.params ?? {}),
      per_page: req.perPage,
      page: req.page,
      request: { ...(req.request ?? {}) },
      ...(req.filter ? { filter: req.filter } : {}),
    })
    // "If data was requested, it will be available in the data field at the
    // top level of the response body." A list without a data array must not
    // read as an empty last page.
    if (!Array.isArray(env?.data))
      throw upstreamError(`Scoro ${module}/list returned no data array`)
    return env.data as T[]
  }

  /** POST {module}/view/{id} with "request": {}. */
  async view<T>(module: string, id: string): Promise<T> {
    const env = await this.call(`${module}/view/${encodeURIComponent(id)}`, { request: {} })
    const data = env?.data
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw upstreamError(`Scoro ${module}/view returned no data object`)
    }
    return data as T
  }

  // ── Writes (out of scope for the read rebuild; paths unchanged) ────────────

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const env = await this.call(`${endpoint}/add`, { ...((body as Record<string, unknown>) ?? {}) })
    return (env?.data ?? env) as T
  }

  async put<T>(endpoint: string, id: string, body: unknown): Promise<T> {
    const env = await this.call(`${endpoint}/modify/${id}`, {
      ...((body as Record<string, unknown>) ?? {}),
    })
    return (env?.data ?? env) as T
  }

  async delete(endpoint: string, id: string): Promise<void> {
    await this.call(`${endpoint}/delete/${id}`, {})
  }
}
