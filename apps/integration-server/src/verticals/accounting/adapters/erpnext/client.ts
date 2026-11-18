import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * The site's REST base comes from the connection's credentials (collected and
 * vetted by the Connect Link form); a deployment-level `baseUrl` is only a
 * fallback. There is deliberately no public default — the key and secret must
 * never be sent to a site the customer did not name.
 */
export function resolveErpNextBaseUrl(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['baseUrl']
  const baseUrl = typeof stored === 'string' && stored ? stored : fallback
  if (!baseUrl) {
    throw new Error('ERPNext connection is missing its site URL — reconnect it through Connect Link.')
  }
  return baseUrl
}

export class ErpNextClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, fallbackBaseUrl?: string) {
    const baseUrl = resolveErpNextBaseUrl(credentials, fallbackBaseUrl)
    const apiKey = credentials.accessToken
    const apiSecret = (credentials.extra?.['apiSecret'] as string) ?? ''
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `token ${apiKey}:${apiSecret}`,
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

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
