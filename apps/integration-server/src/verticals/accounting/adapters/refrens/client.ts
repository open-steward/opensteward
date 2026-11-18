/**
 * Refrens HTTP client.
 *
 * All resource endpoints are scoped under /businesses/:urlKey/ and the JWT
 * is passed as `Authorization: Bearer <jwt>`.
 *
 * The urlKey is read from credentials.extra.urlKey so the adapter can call
 * client.get('invoices', ...) without repeating the scoping prefix everywhere.
 */

import axios, { type AxiosInstance } from 'axios'
import { REFRENS_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class RefrensClient {
  private http: AxiosInstance
  /** Exposed so the adapter can read it when constructing paths. */
  readonly urlKey: string

  constructor(credentials: Credentials) {
    this.urlKey = (credentials.extra?.['urlKey'] as string | undefined) ?? ''
    this.http = axios.create({
      baseURL: `${REFRENS_API_BASE}/businesses/${this.urlKey}/`,
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

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }
}

/**
 * Client scoped to the top-level /businesses base for business-info requests.
 */
export class RefrensRootClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${REFRENS_API_BASE}/`,
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
