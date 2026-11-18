import type { Credentials } from '@opensteward/shared'

/**
 * Sage CRM RESTful API client.
 *
 * URL format, from https://developer.sage.com/crm/apis/crm/2024.02/crm-2024r2-rest-api-ref/using-the-api:
 *   "http://{server}/sdata/{installName}j/sagecrm2/-/{resource}"
 *   "{installName} is the Sage CRM installation name specified in the Setup
 *    Wizard. The default installation name is crm."
 *
 * Auth, same page:
 *   "Authorization: Basic {credentials}"
 *   "Where {credentials} is user name and password separated by a colon (:)
 *    and encoded in Base64."
 *
 * The Connect Link form (see index.ts) stores the Base64 `{credentials}` in
 * `accessToken`, and the server URL and install name in `extra`. A connection
 * made before this rebuild holds only an API key and no server, and cannot be
 * served: Sage CRM documents no API-key auth, and every instance is
 * self-hosted, so there is no default host.
 */

export const DEFAULT_INSTALL_NAME = 'crm'

function notConfigured(what: string): Error {
  return Object.assign(
    new Error(
      `Sage CRM connection is missing ${what}. Reconnect with the Sage CRM server URL, ` +
        'installation name, user name and password.',
    ),
    { statusCode: 401, code: 'RECONNECT_REQUIRED' },
  )
}

/** `http(s)://{server}/sdata/{installName}j/sagecrm2/-` for this connection. */
export function sageCrmBaseUrl(credentials: Credentials): string {
  const server = credentials.extra?.['serverUrl']
  if (typeof server !== 'string' || !server.trim()) throw notConfigured('the server URL')
  const install = credentials.extra?.['installName']
  const installName =
    typeof install === 'string' && install.trim() ? install.trim() : DEFAULT_INSTALL_NAME
  return `${server.trim().replace(/\/+$/, '')}/sdata/${encodeURIComponent(installName)}j/sagecrm2/-`
}

export class SageCrmClient {
  private readonly authorization: string
  private readonly baseUrl: string

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) throw notConfigured('the user name and password')
    this.authorization = `Basic ${credentials.accessToken}`
    this.baseUrl = sageCrmBaseUrl(credentials)
  }

  private async request<T>(
    method: string,
    path: string,
    query?: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v)
    const headers: Record<string, string> = {
      Authorization: this.authorization,
      Accept: 'application/json',
    }
    if (body != null) headers['Content-Type'] = 'application/json'
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Sage CRM API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  /**
   * "Retrieve all {Resource} records": GET /{Resource}. The only documented
   * query parameter is `orderBy` ("orderBy={field name} {order}"), and the
   * documented 200 response is `type: array` of the resource — every record,
   * no paging parameters or envelope.
   */
  async listAll<T>(resource: string, orderBy: string): Promise<T[]> {
    const res = await this.request<unknown>('GET', `/${resource}`, { orderBy })
    if (!Array.isArray(res)) {
      throw Object.assign(
        new Error(`Sage CRM GET /${resource} did not return the documented JSON array`),
        { statusCode: 502 },
      )
    }
    return res as T[]
  }

  /** "Retrieve a {Resource} record": GET /{Resource}('{key}'), key is int32. */
  async getByKey<T>(resource: string, key: string): Promise<T> {
    if (!/^\d+$/.test(key)) {
      throw Object.assign(new Error(`Sage CRM ${resource} key must be an integer (got "${key}")`), {
        statusCode: 400,
        code: 'VALIDATION',
      })
    }
    return this.request<T>('GET', `/${resource}('${key}')`)
  }

  // Write helpers: kept for the write methods, which are out of scope for the
  // read rebuild and still call their original paths.
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
