/**
 * FastSpring REST API client — thin axios wrapper.
 *
 * Auth is HTTP Basic: the stored API password is `credentials.accessToken`
 * and the API username rides on `credentials.extra.username`; the two are
 * Base64-encoded into an `Authorization: Basic …` header on every request.
 * A `User-Agent` is mandatory per the FastSpring docs.
 *
 * Pagination: list endpoints accept `page` + `limit` (default/max 50) and
 * return an envelope that wraps the rows in a named array (`accounts`,
 * `orders`, `subscriptions`, …) alongside `page` / `limit` / `total` /
 * `totalPages` / `nextPage`.
 *
 * Docs: https://developer.fastspring.com/reference/getting-started-with-your-api
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { usernameFromCredentials } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Shape of FastSpring list responses — the rows live under a named key. */
export interface FastspringListEnvelope {
  page?: number
  limit?: number
  total?: number
  totalPages?: number
  nextPage?: number | null
  [key: string]: unknown
}

export class FastspringClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const username = usernameFromCredentials(credentials)
    const basic = Buffer.from(`${username}:${credentials.accessToken}`).toString('base64')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${basic}`,
        'User-Agent': 'OpenSteward-Integration/1.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  /**
   * GET a paginated list and pull the rows out of the named envelope key
   * (e.g. `accounts`, `orders`). FastSpring also accepts a comma-separated
   * id list on the detail path (`/accounts/id1,id2`) which returns a bare
   * array; both shapes are handled.
   */
  async list<T>(
    path: string,
    key: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const data = await this.get<FastspringListEnvelope | T[]>(path, params)
    if (Array.isArray(data)) return data
    const rows = data?.[key]
    return Array.isArray(rows) ? (rows as T[]) : []
  }
}
