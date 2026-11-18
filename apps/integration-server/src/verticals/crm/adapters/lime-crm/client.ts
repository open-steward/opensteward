import type { Credentials } from '@opensteward/shared'

async function request<T>(
  method: string,
  path: string,
  token: string,
  baseUrl: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  // A path is appended to the tenant base URL; a full URL (a HAL `next`
  // link, already checked by the caller) is used as is.
  const url = /^https?:\/\//i.test(path) ? new URL(path) : new URL(`${baseUrl}${path}`)
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
      // "The key must be sent as the value of a header named `x-api-key` in
      // every request." (Limeobject and Limetype API specs)
      'x-api-key': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Lime CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

/**
 * Trims the instance URL and its trailing slashes, and refuses anything but
 * https: "The API can and should only be accessed over HTTPS."
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject). An http:// base
 * would send the API key in clear text.
 */
export function normaliseInstanceUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  let scheme: string
  try {
    scheme = new URL(trimmed).protocol
  } catch {
    scheme = ''
  }
  if (scheme !== 'https:') {
    throw Object.assign(
      new Error(
        'Lime CRM instance URL must be an https:// URL (https://<yourdomain>/<application>/api/v1)',
      ),
      { statusCode: 400, code: 'INVALID_INSTANCE_URL' },
    )
  }
  return trimmed
}

export class LimeCrmClient {
  private token: string
  private baseUrl: string

  /**
   * Every Lime CRM application has its own base URL, of the documented form
   * "https://<yourdomain>/<application>/api/v1/docs/"
   * (https://docs.lime-crm.com/integration/rest-apis/start), so it comes from
   * the connection (`credentials.extra.instanceUrl`, e.g.
   * https://lime.example.com/Lime%20CRM/api/v1). There is no shared host to
   * fall back to: without it the client refuses before sending anything.
   */
  constructor(credentials: Credentials) {
    const instanceUrl = credentials.extra?.['instanceUrl']
    if (typeof instanceUrl !== 'string' || instanceUrl.trim() === '') {
      throw Object.assign(
        new Error(
          'Lime CRM connection has no instance URL (https://<yourdomain>/<application>/api/v1); reconnect with it',
        ),
        { statusCode: 400, code: 'MISSING_INSTANCE_URL' },
      )
    }
    this.token = credentials.accessToken
    this.baseUrl = normaliseInstanceUrl(instanceUrl)
  }

  /** The tenant base URL this client talks to. */
  get instanceUrl(): string {
    return this.baseUrl
  }

  /**
   * One page of a HAL collection, with the href of the next page.
   *
   * Docs: "Responses are sent in JSON/HAL format" and "The following next
   * object page can be retrieved by following the `next` link provided in the
   * response." (http://static.lime-crm.com/crm-api-docs/spec/limeobject). Page
   * 1 is `path` with `params`; every later page is the `next` href verbatim.
   * A link to another origin is refused so the API key never leaves the tenant.
   *
   * The spec does not name the HAL relation the objects are embedded under.
   * Lime Technologies' own client, @limetech/n8n-nodes-lime-crm
   * (https://github.com/Lundalogik/lime-n8n-nodes-crm,
   * nodes/LimeCrm/transport/limeobjects.ts), types the collection response as
   * "_embedded: { limeobjects: LimeobjectCrmApiResponse[]; }", so that is the
   * one key read. A body without that array is an error, never an empty
   * page: an empty page with no next link tells the sync the collection is
   * complete, and it would drop every cached row.
   */
  async listPage<T>(
    path: string,
    params: Record<string, unknown>,
    nextHref?: string,
  ): Promise<{ items: T[]; next?: string }> {
    let target = path
    let query: Record<string, unknown> | undefined = params
    if (nextHref !== undefined) {
      const base = new URL(this.baseUrl)
      const next = new URL(nextHref, `${this.baseUrl.replace(/\/+$/, '')}/`)
      if (next.origin !== base.origin) {
        throw new Error(`Lime CRM next link points to another origin: ${next.origin}`)
      }
      target = next.toString()
      query = undefined
    }
    const res = await request<{
      _embedded?: { limeobjects?: unknown }
      _links?: { next?: { href?: unknown } }
    }>('GET', target, this.token, this.baseUrl, query)
    const items = res?._embedded?.limeobjects
    if (!Array.isArray(items)) {
      throw Object.assign(
        new Error(`Lime CRM list response for ${path} has no _embedded.limeobjects array`),
        { statusCode: 502, code: 'UPSTREAM_SHAPE' },
      )
    }
    const href = res?._links?.next?.href
    return { items: items as T[], next: typeof href === 'string' && href !== '' ? href : undefined }
  }

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.token, this.baseUrl)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.token, this.baseUrl, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.token, this.baseUrl, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token, this.baseUrl)
  }
}
