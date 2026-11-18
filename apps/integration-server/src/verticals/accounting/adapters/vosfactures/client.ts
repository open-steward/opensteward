/**
 * VosFactures HTTP client.
 *
 * Authentication: every request carries the api_token as a query-string
 * parameter.  The account subdomain is read from `credentials.extra.accountName`
 * to build the per-tenant base URL.
 *
 * All list endpoints return JSON arrays directly under a resource key (e.g.
 * `invoices`, `clients`).  Single-resource endpoints wrap the object under its
 * singular key (e.g. `invoice`, `client`).
 */
import axios, { type AxiosInstance } from 'axios'
import { vosfacturesBaseUrl } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class VosfacturesClient {
  private http: AxiosInstance
  /** The api_token appended to every request as a query parameter. */
  private readonly apiToken: string

  constructor(credentials: Credentials) {
    const accountName = (credentials.extra?.['accountName'] as string | undefined) ?? ''
    this.apiToken = credentials.accessToken
    this.http = axios.create({
      baseURL: vosfacturesBaseUrl(accountName),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /** Merge the api_token into every outbound query-string. */
  private authParams(params?: Record<string, unknown>): Record<string, unknown> {
    return { api_token: this.apiToken, ...params }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.authParams(params) })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.authParams(),
      })
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        params: this.authParams(),
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params: this.authParams() })
    })
  }
}
