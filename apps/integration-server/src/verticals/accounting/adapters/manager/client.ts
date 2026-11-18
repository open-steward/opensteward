/**
 * HTTP client for the Manager API2.
 *
 * Auth: X-API-KEY request header.
 * Base URL: https://{businessSlug}.manager.io/api2
 *           (or http://localhost:55667/api2 for server edition when tenantId is absent)
 * Pagination: skip + pageSize query parameters.
 */
import axios, { type AxiosInstance } from 'axios'
import { buildApiBase } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class ManagerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const base = buildApiBase(credentials.tenantId ?? undefined)
    this.http = axios.create({
      baseURL: base,
      headers: {
        'X-API-KEY': credentials.accessToken,
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
