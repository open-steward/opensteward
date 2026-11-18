import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH, DEFAULT_HOST } from './constants'

/**
 * Thin HTTP client for the MantisBT REST API.
 *
 * Authentication: the API token is passed verbatim in the `Authorization`
 * header (no "Bearer" prefix — MantisBT reads the raw value).
 *
 * Base URL: MantisBT is self-hosted. The host can be stored in
 * `credentials.extra.host`; it falls back to `DEFAULT_HOST`.
 *
 * Pagination: query params `page` (1-based) and `page_size`.
 */

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

/** The install this connection talks to, without a trailing slash. */
export function mantisbtHost(credentials: Credentials): string {
  const host =
    (typeof credentials.extra?.['host'] === 'string' ? credentials.extra['host'] : '') ||
    DEFAULT_HOST
  return host.replace(/\/$/, '')
}

export class MantisbtClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = (credentials.accessToken ?? '').trim()
    if (!token) {
      throw new Error('MantisBT connection is missing the API token.')
    }
    this.http = axios.create({
      baseURL: `${mantisbtHost(credentials)}${API_BASE_PATH}`,
      headers: {
        Authorization: token,
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
