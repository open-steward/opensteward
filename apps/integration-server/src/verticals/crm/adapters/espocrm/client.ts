import type { Credentials } from '@opensteward/shared'

// EspoCRM is self-hosted. https://docs.espocrm.com/development/api/:
//   "The root API path is: api/v1/."
//   "GET https://address_of_your_crm/api/v1/Contact/55643ca033f7ab4c5"
//   "Client implementations require specifying the Site URL. It's an URL that
//    you open in the browser to use EspoCRM."
//   "Authentication header: X-Api-Key: API_KEY_COPIED_FROM_THE_USER_DETAIL_VIEW"
//
// The site URL is the customer's own, from credentials.extra.instanceUrl.
// There is no vendor-wide host to fall back to: an absent URL used to send the
// customer's API key to https://demo.espocrm.com.

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  baseUrl: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${baseUrl}/api/v1${path}`)
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
    throw Object.assign(new Error(`EspoCRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

/**
 * One page of a documented list (https://docs.espocrm.com/development/api/crud/):
 *
 *   Returns: { "list": [... array of records...], "total": {totalCountOfRecords} }
 *
 * `total` is kept as sent, including the documented -1 ("there are more
 * records") and -2 ("there are no more records") stand-ins.
 */
export interface EspoCrmListPage<T> {
  items: T[]
  total?: number
}

export class EspoCrmClient {
  private apiKey: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    const raw = credentials.extra?.['instanceUrl']
    const instanceUrl = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
    if (!instanceUrl) {
      throw Object.assign(
        new Error(
          'EspoCRM connection has no instance URL (credentials.extra.instanceUrl): EspoCRM is self-hosted and the API lives at {siteUrl}/api/v1. Reconnect with the site URL.',
        ),
        { statusCode: 400, code: 'MISSING_INSTANCE_URL' },
      )
    }
    this.baseUrl = instanceUrl
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiKey, this.baseUrl, params)
  }

  /**
   * GET a list endpoint with exactly the query it is given, and read the
   * documented `{ list, total }` envelope. Callers pass only documented
   * parameters (`offset`, `maxSize`, `orderBy`, `order`, `searchParams`).
   */
  async list<T>(path: string, query: Record<string, unknown>): Promise<EspoCrmListPage<T>> {
    const res = await request<{ list?: unknown; total?: unknown }>(
      'GET',
      path,
      this.apiKey,
      this.baseUrl,
      query,
    )
    if (!res || !Array.isArray(res.list)) {
      throw new Error(`EspoCRM ${path}: response has no "list" array`)
    }
    return {
      items: res.list as T[],
      ...(typeof res.total === 'number' ? { total: res.total } : {}),
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
