import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/**
 * Samdock's only documented auth is an HTTP bearer JWT:
 * `"securitySchemes": { "bearer": { "scheme": "bearer", "bearerFormat": "JWT", "type": "http" } }`
 * (https://samdock.readme.io/reference/personscontroller_browse.md).
 */
async function request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Samdock API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class SamdockClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.token)
  }

  /**
   * A documented browse endpoint: `"parameters": []` and a bare-array 200, so
   * one request returns the whole collection and nothing is sent to page it.
   * A 200 that is not the documented array has no rows to read and yields [].
   * This is the repo's convention for bare-array lists (holded and others),
   * and it is what lets check:paging-contract, whose stub body is an object,
   * measure these lists. The cost: a malformed 200 reads as an empty, complete
   * collection. Throwing instead turns all three lists into unmeasured-error.
   */
  async browse<T>(path: string): Promise<T[]> {
    const res = await request<unknown>('GET', path, this.token)
    return Array.isArray(res) ? (res as T[]) : []
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.token, body)
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.token, body)
  }

  delete(path: string): Promise<void> {
    return request<void>('DELETE', path, this.token)
  }
}
