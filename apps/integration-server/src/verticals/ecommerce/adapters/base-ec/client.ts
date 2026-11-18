/**
 * BASE (thebase.in) REST API client.
 *
 * Auth: `Authorization: Bearer {access_token}` (confirmed —
 * https://docs.thebase.in/api/).
 *
 * Mutations are POSTed to verb-named endpoints (`items/add`, `items/edit`,
 * `items/delete`, ...) rather than using PUT/DELETE HTTP methods — BASE has
 * no REST-style resource mutation. The documented array parameters
 * (`variation[0]`, `variation_stock[0]`, ...) are PHP-style indexed form
 * fields, so mutation bodies are sent as `application/x-www-form-urlencoded`,
 * not JSON.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/**
 * Flatten a body object into `application/x-www-form-urlencoded` params.
 * Arrays become indexed keys (`key[0]`, `key[1]`, ...) per BASE's documented
 * `variation[0]` / `variation_stock[0]` convention. `null`/`undefined`
 * values are omitted rather than serialised as the string `"undefined"`.
 */
export function toFormParams(body: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== undefined && item !== null) params.append(`${key}[${i}]`, String(item))
      })
    } else {
      params.append(key, String(value))
    }
  }
  return params
}

export class BaseEcClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'BaseEcClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, toFormParams(body), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }
}
