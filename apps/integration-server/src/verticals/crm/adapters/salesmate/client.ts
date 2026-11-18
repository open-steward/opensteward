import type { Credentials } from '@opensteward/shared'
import { HOST_SUFFIX } from './constants'

/**
 * Salesmate v4 REST client.
 *
 * Every documented v4 request (https://apidocs.salesmate.io/, Postman
 * collection 7811505/S1ZucWTA) goes to `https://link_name.salesmate.io/apis/…`
 * with the headers
 *
 *   x-linkname:   link_name.salesmate.io
 *   accessToken:  {{sessionToken}}      ("Session Token")
 *   Content-Type: application/json
 *
 * and answers `{ "Status": "success", "Data": … }`, or
 * `{ "Status": "failure", "Error": { "Code", "Name", "Message" } }` — which the
 * docs show both as HTTP 400 and, for "update deal - Validation Error (For
 * Required Field)", as HTTP 200. Both are errors here.
 *
 * The collection notes "We will be deprecating the v1 and v3 versions of the
 * Salesmate APIs by May 1, 2023."; the `Access-Key` header and `api/v3/…`
 * paths this client used before appear nowhere in it.
 */

const LINKNAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

/**
 * The account's link name: the `link_name` of `link_name.salesmate.io`.
 * Accepts the bare name or the full host (the docs' `x-linkname` value), and
 * nothing that could steer the request to another host.
 */
export function normaliseLinkname(input: string): string {
  let v = input.trim().toLowerCase()
  v = v.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (v.endsWith(HOST_SUFFIX)) v = v.slice(0, -HOST_SUFFIX.length)
  if (!LINKNAME_RE.test(v)) {
    throw new Error(
      `Salesmate: link name must be the "link_name" of link_name.salesmate.io (got "${input}")`,
    )
  }
  return v
}

interface Envelope<T> {
  Status?: string
  Data?: T
  Error?: { Code?: string; Name?: string; Message?: string }
}

/** `Data` of a documented search response ("Search contacts" example). */
export interface SearchData<T> {
  data?: T[]
  totalRows?: number
  totalPages?: number
}

/**
 * Reads answer `{ "Status": "success", "Data": … }`. A success without `Data`
 * is neither a record nor an empty page, so it is an error rather than being
 * read as something else.
 */
function requireData<T>(data: T | undefined, path: string): T {
  if (data === undefined || data === null) {
    throw Object.assign(new Error(`Salesmate ${path} answered without the documented Data`), {
      statusCode: 502,
    })
  }
  return data
}

export class SalesmateClient {
  private readonly token: string
  private readonly linkname: string

  constructor(credentials: Credentials) {
    const linkname = credentials.extra?.['linkname']
    if (typeof linkname !== 'string' || !linkname.trim()) {
      throw Object.assign(
        new Error(
          'Salesmate: credentials.extra.linkname is required (the link_name of link_name.salesmate.io); reconnect to supply it',
        ),
        { statusCode: 400 },
      )
    }
    if (!credentials.accessToken) {
      throw Object.assign(new Error('Salesmate: an access token is required'), { statusCode: 400 })
    }
    this.token = credentials.accessToken
    this.linkname = normaliseLinkname(linkname)
  }

  private async request<T>(
    method: string,
    path: string,
    query?: Record<string, string | number>,
    body?: unknown,
  ): Promise<T> {
    const host = `${this.linkname}${HOST_SUFFIX}`
    const url = new URL(`https://${host}/${path}`)
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v))

    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        accessToken: this.token,
        'x-linkname': host,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const text = await res.text().catch(() => '')
    let parsed: Envelope<T> | undefined
    try {
      parsed = text ? (JSON.parse(text) as Envelope<T>) : undefined
    } catch {
      parsed = undefined
    }

    if (!res.ok || parsed?.Status === 'failure') {
      const detail = parsed?.Error?.Message ?? (text || res.statusText)
      throw Object.assign(new Error(`Salesmate API error ${res.status}: ${detail}`), {
        statusCode: res.ok ? 400 : res.status,
      })
    }
    return parsed?.Data as T
  }

  /** `GET /apis/<module>/v4/<id>` → `Data`. */
  async get<T>(path: string): Promise<T> {
    return requireData(await this.request<T>('GET', path), path)
  }

  /**
   * `POST /apis/<module>/v4/search?rows=…&from=…` → `Data`
   * (`{ data, totalRows, totalPages }`).
   */
  async search<T>(
    path: string,
    query: Record<string, string | number>,
    body: unknown,
  ): Promise<SearchData<T>> {
    return requireData(await this.request<SearchData<T>>('POST', path, query, body), path)
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, undefined, body)
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<unknown>('DELETE', path)
  }
}
