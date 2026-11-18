/**
 * Unicommerce HTTP client.
 *
 * All API calls go to https://{tenant}.unicommerce.com/services/rest/v1/…
 * Auth header: Authorization: bearer {accessToken}
 * Facility-level APIs additionally need: Facility: {facility-code}
 *
 * Unicommerce uses POST for read operations (GET Inventory Snapshot, Search Items, etc.)
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { tenantBaseUrl, API_BASE_PATH } from './constants'
import { normaliseTenant } from './auth'

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

export class UnicommerceClient {
  private http: AxiosInstance
  private facilityHttp: AxiosInstance

  constructor(credentials: Credentials) {
    // Re-normalise on read: a row stored before validation existed must not
    // steer the bearer token to a host outside unicommerce.com.
    const tenant = normaliseTenant(credentials.extra?.['tenant'])
    const facility = String(credentials.extra?.['facility'] ?? '')

    const baseURL = `${tenantBaseUrl(tenant)}${API_BASE_PATH}`
    const commonHeaders = {
      Authorization: `bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    this.http = axios.create({ baseURL, headers: commonHeaders, timeout: 30_000 })

    // Facility-level client includes the Facility header when a code is configured
    this.facilityHttp = axios.create({
      baseURL,
      headers: facility
        ? { ...commonHeaders, Facility: facility }
        : commonHeaders,
      timeout: 30_000,
    })
  }

  /** POST to a tenant-level endpoint (no Facility header). */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body ?? {})
      return data
    })
  }

  /** POST to a facility-level endpoint (includes Facility header if set). */
  async postFacility<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.facilityHttp.post<T>(path, body ?? {})
      return data
    })
  }
}
