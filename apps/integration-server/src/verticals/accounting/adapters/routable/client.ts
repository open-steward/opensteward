import axios, { type AxiosInstance } from 'axios'
import { ROUTABLE_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * HTTP client for the Routable REST API v1.
 *
 * Auth: Bearer token in the Authorization header (API key, not OAuth2).
 * Pagination: page / page_size query params; responses have `{ results: T[], links: { next } }`.
 *
 * Docs: https://developers.routable.com/reference/introduction
 */
export class RoutableClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, sandbox = false) {
    const baseURL = sandbox
      ? 'https://api.sandbox.routable.com/v1/'
      : ROUTABLE_API_BASE
    this.http = axios.create({
      baseURL,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
