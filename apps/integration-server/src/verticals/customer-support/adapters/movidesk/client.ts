/**
 * Movidesk (Zenvia Service) HTTP client.
 *
 * Auth: the API token is injected as the `token` query-string parameter on
 * every request (Movidesk does not use an Authorization header).
 *
 * Pagination: OData-style `$top` / `$skip` — caller controls these.
 * Rate limit: 10 req/min → back-off on 429 / 5xx.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class MovideskClient {
  private http: AxiosInstance
  /** API token — appended as `?token=` on every request */
  private readonly token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { token: this.token, ...params },
      })
      return data
    })
  }
}
