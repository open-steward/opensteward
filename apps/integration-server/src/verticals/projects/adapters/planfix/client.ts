import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

/**
 * Thin HTTP client for the Planfix REST API.
 *
 * Auth is an HTTP Bearer token (`Authorization: Bearer {accessToken}`). The
 * per-account base URL is built from `credentials.extra.account` — Planfix has
 * no shared host, every account lives at its own `{account}.planfix.com`
 * subdomain.
 *
 * Reads come in two shapes:
 *   - GET  `/task/{id}`  → `{ result, task }`
 *   - POST `/task/list`  → `{ result, tasks }`, body `{ offset, pageSize, fields }`
 *
 * List bodies page with a numeric `offset` and a `pageSize` capped at 100, and
 * name the fields to return via a comma-separated `fields` string.
 */
export class PlanfixClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const account = typeof extra['account'] === 'string' ? extra['account'] : ''

    this.http = axios.create({
      baseURL: buildBaseUrl(account),
      headers: {
        Authorization: `Bearer ${credentials.accessToken ?? ''}`,
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
