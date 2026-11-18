/**
 * UVdesk HTTP client.
 *
 * Base URL is per-tenant: https://{subdomain}.uvdesk.com
 * Auth: Authorization: Bearer {accessToken}
 *
 * Pagination: ?page=N&numItemsPerPage=N
 * Response envelope: { tickets/customers/members/... [], pagination_data: {...} }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl, apiPrefix, DEFAULT_LOCALE } from './constants'

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

export class UvdeskClient {
  private http: AxiosInstance
  /** Locale-scoped path prefix, e.g. "/en/api" */
  readonly prefix: string

  constructor(credentials: Credentials) {
    const subdomain = String(credentials.extra?.['subdomain'] ?? '')
    const locale = String(credentials.extra?.['locale'] ?? DEFAULT_LOCALE)
    if (!subdomain) throw new Error('uvdesk: credentials.extra.subdomain is required')

    this.prefix = apiPrefix(locale)

    this.http = axios.create({
      baseURL: buildBaseUrl(subdomain),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** GET /{locale}/api/{path}.json */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(`${this.prefix}${path}`, { params })
      return data
    })
  }
}
