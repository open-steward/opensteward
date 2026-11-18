import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * The instance API base comes from the connection's credentials (collected and
 * vetted by the Connect Link form); a deployment-level `baseUrl` is only a
 * fallback. There is deliberately no public default — the API key must never
 * be sent to a server the customer did not name.
 */
export function resolveDolibarrBaseUrl(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['baseUrl']
  const baseUrl = typeof stored === 'string' && stored ? stored : fallback
  if (!baseUrl) {
    throw new Error('Dolibarr connection is missing its instance URL — reconnect it through Connect Link.')
  }
  return baseUrl
}

export class DolibarrClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, fallbackBaseUrl?: string) {
    this.http = axios.create({
      baseURL: resolveDolibarrBaseUrl(credentials, fallbackBaseUrl),
      headers: {
        DOLAPIKEY: credentials.accessToken,
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

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
