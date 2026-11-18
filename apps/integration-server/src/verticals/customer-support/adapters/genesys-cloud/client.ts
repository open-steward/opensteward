/**
 * Genesys Cloud CX HTTP client.
 *
 * - Bearer token auth via Authorization header.
 * - Region-specific base URL derived from credentials.extra.region.
 * - Offset-based pagination: pageSize + pageNumber; responses include
 *   pageCount / total for detecting end-of-results.
 * - Rate-limit (429) and transient server errors (5xx) are retried with
 *   exponential back-off.
 *
 * Docs: https://developer.genesys.cloud/platform/api/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'
import { regionHost, storedRegion } from './auth'

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
        // Honour Retry-After if present; otherwise exponential back-off
        const retryAfter = axiosErr.response?.headers?.['retry-after']
        const delay = retryAfter
          ? Number(retryAfter) * 1000
          : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class GenesysCloudClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Throws for an unrecognised stored region: the bearer token is only ever
    // sent to a known Genesys Cloud API host.
    const baseURL = API_BASE_URL_TEMPLATE.replace('{region}', regionHost(storedRegion(credentials)))
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

/**
 * Standard paginated list response shape used by most Genesys Cloud list endpoints.
 */
export interface PagedResponse<T> {
  entities?: T[]
  pageSize?: number
  pageNumber?: number
  total?: number
  pageCount?: number
  nextUri?: string
}
