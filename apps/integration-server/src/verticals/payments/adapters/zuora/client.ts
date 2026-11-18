/**
 * Zuora REST API client — thin axios wrapper.
 *
 * "All API requests should include a bearer token in an Authorization HTTP
 * header" (https://developer.zuora.com/docs/guides/authentication.md). The
 * host is the connection's environment (see constants.ts).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS } from './constants'

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

/**
 * The connection's REST host: the `baseUrl` stored at exchange from the
 * chosen environment (auth.ts). A connection stored without one keeps the
 * host this adapter always used, US Production (Cloud 2).
 */
export function baseUrlOf(credentials: Credentials): string {
  const url = (credentials.extra as Record<string, unknown> | undefined)?.baseUrl
  return typeof url === 'string' && url ? url.replace(/\/+$/, '') : HOSTS[DEFAULT_ENVIRONMENT]
}

export class ZuoraClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: baseUrlOf(credentials),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET with a query built as ordered pairs: Object Query takes repeated
   * `filter[]` / `expand[]` keys, which a plain params object cannot carry.
   */
  async get<T>(path: string, query?: URLSearchParams): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, query ? { params: query } : undefined)
      return data
    })
  }
}
