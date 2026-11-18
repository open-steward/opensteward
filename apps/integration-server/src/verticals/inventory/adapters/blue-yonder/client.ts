/**
 * HTTP client for the Blue Yonder (JDA) Luminate WMS REST API.
 *
 * Auth:        Bearer <access_token> in the Authorization header.
 * Base URL:    https://<tenantHost>/wms/v1  (tenant-scoped)
 * Pagination:  page (1-based) + pageSize query params.
 * Retry:       exponential back-off on 429 and 5xx (up to 4 retries).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { assertPublicHost } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { normaliseTenantHost } from './auth'
import { getApiBaseUrl } from './constants'

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

export class BlueYonderClient {
  private http: AxiosInstance
  private readonly tenantHost: string
  private hostCheck?: Promise<void>

  constructor(credentials: Credentials) {
    // Re-validated here: the stored host decides where the bearer token goes.
    this.tenantHost = normaliseTenantHost(credentials.extra?.['tenantHost'])
    this.http = axios.create({
      baseURL: getApiBaseUrl(this.tenantHost),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** The tenant host is customer-supplied: vet it once before the bearer token goes to it. */
  private ensurePublicHost(): Promise<void> {
    return (this.hostCheck ??= assertPublicHost(this.tenantHost))
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
