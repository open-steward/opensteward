/**
 * Kinaxis Maestro REST API client.
 *
 * Tenant-scoped: every request goes to https://{tenant}.kinaxis.com/api/v1.
 * Bearer token from OAuth2 credentials; tenant slug from credentials.extra.tenant.
 *
 * Rate limiting: Kinaxis enforces per-tenant quotas; we apply exponential
 * back-off on 429 and 5xx responses.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { apiBaseUrl, DEFAULT_PAGE_SIZE } from './constants'

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

export class KinaxisClient {
  private http: AxiosInstance
  private readonly tenant: string

  constructor(credentials: Credentials) {
    const tenant = String(credentials.extra?.['tenant'] ?? '')
    if (!tenant) throw new Error('kinaxis: credentials.extra.tenant is required')
    this.tenant = tenant
    this.http = axios.create({
      baseURL: apiBaseUrl(tenant),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  getTenant(): string {
    return this.tenant
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /** Convenience wrapper: page through all results for a list endpoint.
   *  Kinaxis uses 1-indexed `page` + `pageSize` query params.
   *  Stops when the returned array length is less than pageSize.
   */
  async getPage<T>(
    path: string,
    page: number,
    pageSize: number = DEFAULT_PAGE_SIZE,
    extraParams?: Record<string, unknown>,
  ): Promise<T> {
    return this.get<T>(path, { page, pageSize, ...extraParams })
  }
}
