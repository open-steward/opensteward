/**
 * Thin HTTP client for the Kaiten REST API.
 *
 * Kaiten is a multi-tenant SaaS.  Each company has its own subdomain:
 *   https://<company>.kaiten.ru/api/latest
 *
 * The tenant base URL is supplied at construction time via
 * `credentials.extra.baseUrl` (set when the user enters their company domain
 * on the Connect Link form).  Authentication is a Bearer token carried in
 * every request's `Authorization` header.
 *
 * Rate limit: 5 req/s.  HTTP 429 responses are retried with exponential
 * back-off (same as 5xx).
 */
import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_PATH } from './constants'

export class KaitenClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = (credentials.accessToken ?? '').trim()
    if (!token) {
      throw new Error('Kaiten connection is missing the API token.')
    }
    const baseUrl = (credentials.extra?.['baseUrl'] as string | undefined) ?? ''
    if (!baseUrl) {
      throw new Error('Kaiten connection is missing the company base URL.')
    }
    this.http = axios.create({
      baseURL: `${baseUrl.replace(/\/+$/, '')}${API_PATH}`,
      headers: {
        Authorization: `Bearer ${token}`,
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
