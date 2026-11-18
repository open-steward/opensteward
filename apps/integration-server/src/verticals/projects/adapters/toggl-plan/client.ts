/**
 * Toggl Plan REST client.
 *
 * Authentication: Bearer token (api_key stored as credentials.accessToken).
 * Base URL: https://api.plan.toggl.com/api/v5
 * URL structure: /{workspace_id}/{resource}
 *
 * Pagination: Toggl Plan returns full arrays per request; no documented
 * cursor/offset mechanism. The client exposes a plain get<T[]> helper.
 *
 * Rate limits: 429 + 5xx trigger exponential backoff.
 *
 * Docs: https://developers.plan.toggl.com/api-v5.html
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

export class TogglPlanClient {
  private http: AxiosInstance
  /** Workspace ID extracted from credentials.extra.workspaceId */
  readonly workspaceId: string

  constructor(credentials: Credentials) {
    this.workspaceId = String(
      (credentials.extra as Record<string, unknown> | undefined)?.['workspaceId'] ?? '',
    )
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Build a workspace-scoped path: /{workspaceId}/{resource} */
  wsPath(resource: string): string {
    return `/${this.workspaceId}/${resource}`
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}
