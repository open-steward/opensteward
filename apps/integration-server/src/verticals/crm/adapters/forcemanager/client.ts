import type { Credentials } from '@opensteward/shared'
import { BASE_URL, MAX_WALK_PAGES } from './constants'

/**
 * ForceManager (Sage Sales Management) API v4 client.
 *
 * Docs: https://developer.forcemanager.com/openapi.json (OpenAPI 3.0.3).
 *
 * Auth: `POST /login` with body `{"username":"YOUR_PUBLIC_KEY","password":"YOUR_PRIVATE_KEY"}`
 * returns `{"token": "..."}`. Every other call sends that token in the only
 * declared security scheme, `{"type":"apiKey","in":"header","name":"X-Session-Key"}`:
 * "X-Session-Key | AUTH_TOKEN | This field must be completed with the token
 * obtained at the authentication". The token lifetime is undocumented, so the
 * client logs in once per instance (one adapter call) and never stores it.
 *
 * Paging: "The call return a \[\] when you are at the last page", with the
 * page chosen by "`page={{number}}` ... since the first page is 0" and the
 * page size by a header the overview names `X-FM-Entity-Count` and each list
 * endpoint's header table names `Count` ("The number of records to return in
 * each page of results. The default page limit is 50"). Both are sent.
 */

export interface ForceManagerKeys {
  publicKey: string
  privateKey: string
}

/** The public key (accessToken) and private key (extra.privateKey) a connection stores. */
export function keysFrom(credentials: Credentials): ForceManagerKeys {
  const publicKey = credentials.accessToken
  const privateKey = credentials.extra?.['privateKey']
  if (!publicKey || typeof privateKey !== 'string' || !privateKey) {
    throw Object.assign(
      new Error(
        'ForceManager needs both the public and the private API key (POST /login takes ' +
          '{"username":"YOUR_PUBLIC_KEY","password":"YOUR_PRIVATE_KEY"}); reconnect with both.',
      ),
      { statusCode: 401 },
    )
  }
  return { publicKey, privateKey }
}

function apiError(status: number, text: string): Error {
  return Object.assign(new Error(`ForceManager API error ${status}: ${text}`), {
    statusCode: status,
  })
}

export class ForceManagerClient {
  private token: Promise<string> | undefined

  constructor(private readonly keys: ForceManagerKeys) {}

  /** POST /login → `{ token }`. */
  private async login(): Promise<string> {
    const res = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ username: this.keys.publicKey, password: this.keys.privateKey }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw apiError(res.status, text)
    }
    const body = (await res.json()) as { token?: unknown }
    if (typeof body?.token !== 'string' || !body.token) {
      throw Object.assign(new Error('ForceManager login returned no token'), { statusCode: 502 })
    }
    return body.token
  }

  private session(): Promise<string> {
    if (!this.token) {
      const pending = this.login()
      // A failed login is not remembered, so the next request tries again.
      pending.catch(() => {
        if (this.token === pending) this.token = undefined
      })
      this.token = pending
    }
    return this.token
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      query?: Record<string, string>
      headers?: Record<string, string>
      body?: unknown
    } = {},
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v)
    const token = await this.session()
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'X-Session-Key': token,
        'Content-Type': 'application/json',
        Accept: '*/*',
        ...options.headers,
      },
      body: options.body != null ? JSON.stringify(options.body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw apiError(res.status, text)
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  /**
   * One upstream page of a list endpoint: `?page=<0-based>`, and when `count`
   * is given, the page-size headers. List responses are documented as a bare
   * JSON array; anything else is an error, never an empty page.
   */
  async page<T>(path: string, page: number, count?: number): Promise<T[]> {
    const headers: Record<string, string> =
      count === undefined ? {} : { Count: String(count), 'X-FM-Entity-Count': String(count) }
    const res = await this.request<unknown>('GET', path, { query: { page: String(page) }, headers })
    if (!Array.isArray(res)) {
      throw Object.assign(new Error(`ForceManager ${path} returned a non-array list response`), {
        statusCode: 502,
      })
    }
    return res as T[]
  }

  /** Every row of a list endpoint, walking pages 0, 1, … until the documented `[]`. */
  async all<T>(path: string): Promise<T[]> {
    const rows: T[] = []
    for (let page = 0; page < MAX_WALK_PAGES; page++) {
      const batch = await this.page<T>(path, page)
      if (batch.length === 0) return rows
      rows.push(...batch)
    }
    throw Object.assign(
      new Error(`ForceManager ${path} did not end within ${MAX_WALK_PAGES} pages`),
      {
        statusCode: 502,
      },
    )
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, { body })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body })
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}
