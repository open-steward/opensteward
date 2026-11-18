/**
 * WATI HTTP client.
 *
 * Authentication: Bearer token in Authorization header.
 *
 * Host: "Use `https://live-mt-server.wati.io` as the API host. V3:
 * `https://live-mt-server.wati.io/api/ext/v3/...` — do not add a tenant ID to
 * the path." (https://docs.wati.io/reference/introduction.md). Every method
 * here is a v3 call, so requests go to the ORIGIN of the endpoint the
 * connection stored (`credentials.extra.baseUrl`, which carries the tenant ID
 * in its path for the legacy v1 API) with the tenant path dropped.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

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

/** The v3 API root for a connection: the stored endpoint without its tenant path. */
export function v3BaseUrl(credentials: Credentials): string {
  const stored = String(credentials.extra?.['baseUrl'] ?? '')
  if (!stored) {
    throw new Error('wati requires credentials.extra.baseUrl (the API endpoint URL)')
  }
  return new URL(stored).origin
}

export class WatiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: v3BaseUrl(credentials),
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
}
