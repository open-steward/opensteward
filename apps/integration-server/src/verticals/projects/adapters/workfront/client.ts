/**
 * Adobe Workfront REST client.
 *
 * Auth: the OAuth2 access token is presented in a custom `sessionID`
 * header (Workfront does NOT use `Authorization: Bearer`). The base host
 * is the customer's domain, carried on `credentials.extra.instanceUrl`; a
 * connection without one is refused rather than sent to a relative URL.
 *
 * Responses are wrapped in a `{ data: ... }` envelope; errors come back
 * as `{ error: ... }`. Search uses `$$FIRST` (offset) and `$$LIMIT`
 * (page size, max 2000) for pagination and `fields` for field selection.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { connectionWorkfrontDomain } from './auth'
import { API_PATH } from './constants'

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

export class WorkfrontClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, fallbackInstanceUrl?: string) {
    const instanceUrl = connectionWorkfrontDomain(credentials, fallbackInstanceUrl)
    this.http = axios.create({
      baseURL: `${instanceUrl}${API_PATH}`,
      headers: {
        sessionID: credentials.accessToken,
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
