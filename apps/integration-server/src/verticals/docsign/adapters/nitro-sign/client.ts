/**
 * Nitro Sign REST API client. Bearer auth + JSON, always on the connection's
 * regional host (see {@link signApiBaseUrl}).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SIGN_API_HOSTS } from './constants'

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

export class NitroSignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseURL: string) {
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path)
      return data
    })
  }
}

/**
 * The connection's Nitro Sign Public API host: `credentials.extra.signApiBaseUrl`,
 * which must be one of the documented regional `servers` exactly. Missing or
 * anything else throws before a request is built — the region is never guessed.
 */
export function signApiBaseUrl(credentials: Credentials): string {
  const configured = credentials.extra?.['signApiBaseUrl']
  const host = typeof configured === 'string' ? configured.replace(/\/+$/, '') : undefined
  if (host === undefined || !SIGN_API_HOSTS.includes(host)) {
    throw Object.assign(
      new Error(
        "Nitro Sign connection needs credentials.extra.signApiBaseUrl set to its region's " +
          `Sign API host, one of ${SIGN_API_HOSTS.join(', ')}` +
          (typeof configured === 'string' ? ` (got "${configured}")` : ''),
      ),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }
  return host
}
