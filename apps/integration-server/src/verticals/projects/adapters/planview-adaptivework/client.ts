import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { LOGIN_SERVER_URL } from './constants'

/**
 * Thin HTTP client for the Planview AdaptiveWork (Clarizen) REST API v2.0.
 *
 * The session id rides in `Authorization: Session <sessionId>`. The base origin
 * is the org's data center, resolved at login and stored on
 * `credentials.extra.baseUrl`; if absent (older connections), it falls back to
 * the default login server.
 *
 * Reads use two shapes:
 *   - `GET data/objects/{TypeName}/{uuid}?fields=...` for single entities.
 *   - `POST data/entityQuery` (`{ typeName, fields, where, paging }`) for
 *     collections, which page via `paging.from` / `paging.limit` and report
 *     `paging.hasMore`.
 */
export class PlanviewAdaptiveworkClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const baseURL =
      typeof extra['baseUrl'] === 'string' && extra['baseUrl'] ? extra['baseUrl'] : LOGIN_SERVER_URL
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Session ${credentials.accessToken}`,
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
