import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { AUTH_TOKEN_HEADER, buildBaseUrl } from './constants'

/**
 * Thin HTTP client for the ActiveCollab REST API.
 *
 * The base URL is account-scoped: the numeric cloud instance id (or a
 * self-hosted origin) is read from `credentials.extra.accountId`. The API
 * token rides in the `X-Angie-AuthApiToken` header.
 *
 * Collections are returned as bare JSON arrays; very large lists are paged
 * with a 1-based `?page=N` query parameter.
 */
export class ActivecollabClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const accountId = String(credentials.extra?.['accountId'] ?? '').trim()
    if (!accountId) {
      throw new Error('ActiveCollab connection is missing the account id.')
    }
    this.http = axios.create({
      baseURL: buildBaseUrl(accountId),
      headers: {
        [AUTH_TOKEN_HEADER]: credentials.accessToken,
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
