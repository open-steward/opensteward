import axios, { type AxiosInstance } from 'axios'
import { getDaftraApiBase } from './constants'
import { isDaftraSubdomain } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * The tenant subdomain comes from the connection's credentials (collected by
 * the Connect Link form); a deployment-level `subdomain` is only a fallback.
 */
export function resolveDaftraSubdomain(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['subdomain']
  const candidate = typeof stored === 'string' && stored ? stored : fallback
  if (!isDaftraSubdomain(candidate)) {
    throw new Error(
      'Daftra connection is missing its subdomain (or it is not a valid daftra.com subdomain) — reconnect it through Connect Link.',
    )
  }
  return candidate
}

export class DaftraClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, fallbackSubdomain?: string) {
    this.http = axios.create({
      baseURL: getDaftraApiBase(resolveDaftraSubdomain(credentials, fallbackSubdomain)),
      headers: {
        'X-API-Key': credentials.accessToken,
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
