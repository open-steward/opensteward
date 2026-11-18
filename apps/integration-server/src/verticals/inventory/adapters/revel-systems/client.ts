/**
 * Revel Systems HTTP client.
 *
 * Base URL:  https://{subdomain}.revelup.com/resources
 * Auth:      Bearer token in Authorization header
 * Pagination: ?limit=N&offset=N  →  { meta: { total_count, limit, offset, next, previous }, objects: [...] }
 *
 * The subdomain is read from credentials.extra.subdomain which is set by auth.ts.
 * A `Client-Id` header (the subdomain) is included on every request per Revel docs
 * for merchant differentiation.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { normaliseRevelSubdomain } from './auth'
import { API_BASE_URL_TEMPLATE } from './constants'

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

export class RevelSystemsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Normalised again here: the stored value decides where the bearer token goes.
    const subdomain = normaliseRevelSubdomain(credentials.extra?.['subdomain'])
    const baseURL = API_BASE_URL_TEMPLATE.replace('{subdomain}', subdomain)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Client-Id': subdomain,
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
