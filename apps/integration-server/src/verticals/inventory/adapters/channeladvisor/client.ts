/**
 * ChannelAdvisor REST API v1 HTTP client.
 *
 * Auth: Bearer access token (OAuth 2.0).
 * Pagination: OData 4.0 — $skip / $top / @odata.nextLink
 * Rate: 2,000 req/min per profile; 5 concurrent per integration.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

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

/** OData collection envelope returned by ChannelAdvisor v1. */
export interface ODataResponse<T> {
  '@odata.count'?: number
  '@odata.nextLink'?: string
  value: T[]
}

export class ChannelAdvisorClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
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

  /**
   * Fetch a single OData page.
   * Returns the parsed ODataResponse including value[] and nextLink.
   */
  async getCollection<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<ODataResponse<T>> {
    return this.get<ODataResponse<T>>(path, params)
  }

  /**
   * Build standard OData query params from OpenSteward QueryParams.
   * $skip is computed from (page - 1) * top.
   */
  static pageParams(opts: { limit?: number; page?: number }): Record<string, unknown> {
    const top = opts.limit ?? DEFAULT_PAGE_SIZE
    const skip = opts.page && opts.page > 1 ? (opts.page - 1) * top : undefined
    return {
      $top: top,
      ...(skip !== undefined ? { $skip: skip } : {}),
    }
  }
}
