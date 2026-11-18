/**
 * Vend POS (Lightspeed Retail X-Series) HTTP client.
 *
 * API v2.0 uses cursor-based pagination via a `version` monotonically-
 * increasing integer. Responses are:
 *   { data: T[], version: { min: number, max: number } }
 *
 * Pagination: keep requesting with `after=version.max` until data is empty.
 *
 * Base URL is per-tenant: https://{domain_prefix}.retail.lightspeed.app/api/2.0
 * The domain_prefix is stored in credentials.extra.domainPrefix.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

function baseUrl(domainPrefix: string): string {
  return API_BASE_URL_TEMPLATE.replace('{domainPrefix}', domainPrefix)
}

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

/** Shape of a v2.0 paginated list response. */
export interface VendListResponse<T> {
  data: T[]
  version?: { min: number; max: number }
}

/** Shape of a v2.0 single-resource response. */
export interface VendSingleResponse<T> {
  data: T
}

export class VendPosClient {
  private readonly http: AxiosInstance

  constructor(credentials: Credentials) {
    const domainPrefix = String(credentials.extra?.['domainPrefix'] ?? '')
    if (!domainPrefix) {
      throw new Error('vend-pos: credentials.extra.domainPrefix is required')
    }
    this.http = axios.create({
      baseURL: baseUrl(domainPrefix),
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
}
