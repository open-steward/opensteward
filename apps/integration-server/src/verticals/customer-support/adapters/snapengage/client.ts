/**
 * SnapEngage HTTP client.
 *
 * Auth: Authorization: <api_token>  (raw token, NOT "Bearer <token>")
 * Base URL: https://www.snapengage.com/api/v2
 * Paths are prefixed with /{orgId} by callers — the orgId comes from
 * credentials.extra.orgId set during credential exchange.
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
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class SnapengageClient {
  private http: AxiosInstance
  readonly orgId: string

  constructor(credentials: Credentials) {
    this.orgId = String((credentials.extra as Record<string, unknown>)?.['orgId'] ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        // SnapEngage expects the raw token, no "Bearer" prefix
        Authorization: credentials.accessToken,
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
}
