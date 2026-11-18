/**
 * Low-level HTTP client for the Tribe CRM OData v4 API.
 *
 * Authentication: Bearer token in the Authorization header.
 * Pagination:     OData $top / $skip query parameters.
 * Response shape: { value: T[] } for list endpoints; T for single-item endpoints.
 */
import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/** OData collection response wrapper. */
interface ODataCollection<T> {
  value: T[]
  '@odata.count'?: number
  '@odata.nextLink'?: string
}

export class TribeCrmClient {
  private readonly token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const u = new URL(`${BASE_URL}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          u.searchParams.set(k, String(v))
        }
      }
    }
    return u.toString()
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Tribe CRM API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  /** GET a collection, applying $top / $skip pagination. */
  async list<T>(
    path: string,
    top: number,
    skip: number,
    extraParams?: Record<string, string | number | undefined>,
  ): Promise<T[]> {
    const url = this.buildUrl(path, { $top: top, $skip: skip, ...extraParams })
    const res = await fetch(url, { method: 'GET', headers: this.headers() })
    const data = await this.handleResponse<ODataCollection<T>>(res)
    return data?.value ?? []
  }

  /** GET a single entity by appending the key to the path, e.g. /Relation(123). */
  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.buildUrl(path, params)
    const res = await fetch(url, { method: 'GET', headers: this.headers() })
    return this.handleResponse<T>(res)
  }

  /** POST to create an entity. */
  async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path)
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    return this.handleResponse<T>(res)
  }

  /**
   * PATCH to update an entity.
   *
   * OData v4 PATCH returns 204 No Content on success.  When the server
   * responds with 204 we re-fetch the record at the same path so the
   * caller always receives the updated entity rather than undefined.
   */
  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path)
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Tribe CRM API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    if (res.status === 204) {
      // Re-fetch the updated record so callers always get a populated entity.
      return this.get<T>(path)
    }
    return res.json() as Promise<T>
  }

  /** DELETE an entity. */
  async delete(path: string): Promise<void> {
    const url = this.buildUrl(path)
    const res = await fetch(url, { method: 'DELETE', headers: this.headers() })
    await this.handleResponse<void>(res)
  }
}
