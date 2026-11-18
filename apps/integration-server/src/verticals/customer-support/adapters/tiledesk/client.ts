/**
 * Tiledesk HTTP client.
 *
 * Auth:       Authorization: JWT <token>
 * Base URL:   https://api.tiledesk.com
 * Tenant URL: https://api.tiledesk.com/v3/:project_id/…
 *
 * Pagination: ?page=N&limit=40 (page is 0-based).
 * Rate limit: ≥ 200 req/min; 429 → exponential back-off.
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

export class TiledeskClient {
  private http: AxiosInstance
  readonly projectId: string

  constructor(credentials: Credentials) {
    const projectId = String((credentials.extra as Record<string, unknown>)?.['projectId'] ?? '')
    if (!projectId) throw new Error('tiledesk: projectId missing from credentials.extra')
    this.projectId = projectId

    // Strip any "JWT " prefix if the stored token already includes it
    const rawToken = credentials.accessToken.startsWith('JWT ')
      ? credentials.accessToken.slice(4)
      : credentials.accessToken

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `JWT ${rawToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Build a tenant-scoped path: /v3/:projectId/<path> */
  private tenant(path: string): string {
    return `/v3/${this.projectId}${path.startsWith('/') ? path : `/${path}`}`
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(this.tenant(path), { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(this.tenant(path), body)
      return data
    })
  }
}
