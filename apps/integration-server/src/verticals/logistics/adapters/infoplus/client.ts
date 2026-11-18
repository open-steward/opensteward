/**
 * Infoplus HTTP client.
 *
 * Wraps Axios with the `API-Key` authentication header and the per-tenant
 * base URL derived from credentials.extra.domain.
 */

import axios, { type AxiosInstance } from 'axios'
import { apiKeyHeader, domainFromCredentials } from './auth'
import { infoplusApiBase } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class InfoplusClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const domain = domainFromCredentials(credentials)
    this.http = axios.create({
      baseURL: infoplusApiBase(domain),
      headers: {
        'API-Key': apiKeyHeader(credentials.accessToken),
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

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
