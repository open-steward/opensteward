import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

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

/**
 * Picqer HTTP client.
 *
 * Auth: HTTP Basic Auth — API key as username, empty string as password.
 * Base URL is per-customer subdomain.
 */
export class PicqerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const subdomain = String(credentials.extra?.['subdomain'] ?? '')
    if (!subdomain) throw new Error('picqer requires credentials.extra.subdomain')
    this.http = axios.create({
      baseURL: buildBaseUrl(subdomain),
      auth: { username: credentials.accessToken, password: '' },
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OpenSteward/1.0 (integration@opensteward.com)',
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
