/**
 * HTTP client for the Scopevisio OpenScope REST API.
 *
 * Authentication: Bearer token in Authorization header.
 * Base URL: https://appload.scopevisio.com/rest
 *
 * List endpoints use HTTP POST with a JSON search-filter body that includes
 * `page` (1-based) and `pageSize` pagination fields; individual resources use
 * HTTP GET with the resource id as a path segment.
 *
 * Docs: https://appload.scopevisio.com/static/swagger/index.html
 */

import axios, { type AxiosInstance } from 'axios'
import { SCOPEVISIO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class ScopevisioClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SCOPEVISIO_API_BASE,
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

  /**
   * POST used for search/list endpoints (Scopevisio pattern).
   * The body is a JSON search-filter object.
   */
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
