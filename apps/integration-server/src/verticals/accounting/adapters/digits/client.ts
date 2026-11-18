/**
 * Digits Connect API HTTP client.
 *
 * Spec: https://developer.digits.com/openapi/openapi.yaml
 *   servers: [{ "url": "https://connect.digits.com", "description": "Production" }]
 *   every read path is /v1/...
 * Auth (https://developer.digits.com/docs/authentication.md):
 *   "Include the access token in the `Authorization` header for all API requests:
 *    Authorization: Bearer eyJ..."
 */
import axios, { type AxiosInstance } from 'axios'
import { DIGITS_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * `Page` in the spec: "cursor": "A marker to track pagination progress",
 * "more": "True if there is more data to fetch".
 */
export interface DigitsPage {
  cursor?: string
  more?: boolean
}

export class DigitsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${DIGITS_API_BASE}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}

/**
 * The cursor that starts the next page, from a response's `next`.
 *
 * Pagination guide (https://developer.digits.com/docs/pagination.md):
 * "Continue fetching pages while `more` is `true`." and "Always use the exact
 * cursor returned by the API." A page that says there is more but names no
 * cursor leaves no documented way to continue, so it throws rather than
 * reporting the collection complete.
 */
export function nextCursor(next: DigitsPage | undefined, path: string): string | undefined {
  if (next?.more !== true) return undefined
  if (typeof next.cursor !== 'string' || next.cursor === '') {
    throw new Error(`Digits ${path}: next.more is true but next.cursor is empty`)
  }
  return next.cursor
}
