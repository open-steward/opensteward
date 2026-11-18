/**
 * Fakturownia HTTP client.
 *
 * Auth: api_token is appended as a query param on every request.
 * The customer's account subdomain determines the base URL
 * (stored in credentials.extra.account).
 *
 * Docs: https://github.com/fakturownia/api
 */
import axios, { type AxiosInstance } from 'axios'
import { FAKTUROWNIA_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class FakturowniaClient {
  private http: AxiosInstance
  private apiToken: string

  constructor(credentials: Credentials) {
    // The api_token is the accessToken; the account subdomain is in extra.account
    this.apiToken = credentials.accessToken
    const account = (credentials.extra as Record<string, string> | undefined)?.['account'] ?? ''
    this.http = axios.create({
      baseURL: FAKTUROWNIA_API_BASE(account),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
  }

  /** Append api_token to every outgoing request. */
  private tokenParams(params?: Record<string, unknown>): Record<string, unknown> {
    return { api_token: this.apiToken, ...params }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.tokenParams(params) })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { api_token: this.apiToken },
      })
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        params: { api_token: this.apiToken },
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params: { api_token: this.apiToken } })
    })
  }
}
