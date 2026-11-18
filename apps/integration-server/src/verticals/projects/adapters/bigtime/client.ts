import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, AUTH_REALM_HEADER, AUTH_TOKEN_HEADER } from './constants'

/**
 * Thin HTTP client for the BigTime IQ v2 REST API.
 *
 * Every request carries two headers: the permanent firm API token in
 * `X-Auth-Token` (from `credentials.accessToken`) and the firm id in
 * `X-Auth-Realm` (from `credentials.extra.firmId`). The base URL is the same
 * for every firm — BigTime selects the firm by the realm header.
 *
 * Collections are returned as bare JSON arrays; BigTime does not page list
 * responses, so the client makes a single request per call.
 */
export class BigtimeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const firmId = String(credentials.extra?.['firmId'] ?? '').trim()
    if (!firmId) {
      throw new Error('BigTime connection is missing the firm id.')
    }
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        [AUTH_TOKEN_HEADER]: credentials.accessToken,
        [AUTH_REALM_HEADER]: firmId,
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
