/**
 * Daraz Open Platform HTTP client with HMAC-SHA256 request signing.
 *
 * Every request to the Daraz API must include a signature computed as:
 * 1. Sort all query/body params alphabetically by key
 * 2. Concatenate: api_path + key1value1 + key2value2 + ...
 * 3. HMAC-SHA256 with app_secret
 * 4. Hex-encode uppercase → `sign` query param
 *
 * This is identical to the Lazada signing scheme — Daraz is an Alibaba
 * subsidiary sharing the same Open Platform infrastructure.
 */

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import crypto from 'crypto'
import type { Credentials } from '@opensteward/shared'
import { resolveBaseUrl, DEFAULT_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Sign a Daraz API request.
 *
 * @param apiPath  The path portion of the URL (e.g. `/products/get`)
 * @param params   All query/body parameters (excluding `sign`)
 * @param appSecret The app secret used as HMAC key
 * @returns Uppercase hex-encoded HMAC-SHA256 signature
 */
export function signDarazRequest(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string,
): string {
  const sorted = Object.keys(params).sort()
  let concatenated = apiPath
  for (const key of sorted) {
    concatenated += key + params[key]
  }
  return crypto
    .createHmac('sha256', appSecret)
    .update(concatenated)
    .digest('hex')
    .toUpperCase()
}

export interface ListResult<T> {
  items: T[]
  totalCount?: number
}

export class DarazClient {
  private http: AxiosInstance
  private appKey: string
  private appSecret: string
  private accessToken: string

  constructor(credentials: Credentials) {
    const country = (credentials.extra?.['country'] as string | undefined) ?? 'pk'
    const baseURL = resolveBaseUrl(country)
    this.appKey = (credentials.extra?.['appKey'] as string) ?? ''
    this.appSecret = (credentials.extra?.['appSecret'] as string) ?? ''
    this.accessToken = credentials.accessToken ?? ''

    if (!this.appKey || !this.appSecret) {
      throw new Error(
        'DarazClient: credentials.extra must contain appKey and appSecret.',
      )
    }
    if (!this.accessToken) {
      throw new Error(
        'DarazClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }

    this.http = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })

    // Install the signing interceptor
    this.http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      return this.signInterceptor(config)
    })
  }

  /**
   * Axios request interceptor that injects `app_key`, `timestamp`,
   * `access_token`, `sign_method`, and `sign` into every request's
   * query params.
   */
  private signInterceptor(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    const timestamp = Date.now().toString()

    // Collect all existing params as strings
    const existingParams: Record<string, string> = {}
    if (config.params) {
      for (const [k, v] of Object.entries(config.params as Record<string, unknown>)) {
        if (v != null) existingParams[k] = String(v)
      }
    }

    // Add the required auth params
    const allParams: Record<string, string> = {
      ...existingParams,
      app_key: this.appKey,
      timestamp,
      access_token: this.accessToken,
      sign_method: 'sha256',
    }

    // Extract the API path from the URL (relative to baseURL)
    const apiPath = config.url ?? ''

    // Compute signature
    const sign = signDarazRequest(apiPath, allParams, this.appSecret)

    // Set all params on the request
    config.params = {
      ...allParams,
      sign,
    }

    return config
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, { params })
      return data
    })
  }

  /**
   * List helper for Daraz's offset-based pagination.
   *
   * Daraz returns data in a `{ data: { products: [...], total_products: N } }` or
   * `{ data: { orders: [...], count_total: N } }` pattern. The caller passes
   * `resourceKey` (e.g. `products`, `orders`) and this helper normalises.
   */
  async list<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE
    const offset = (extraParams['offset'] as number | undefined) ?? 0
    const params: Record<string, unknown> = {
      ...extraParams,
      limit,
      offset,
    }

    const res = await this.get<{ data?: Record<string, unknown>; code?: string; message?: string }>(
      path,
      params,
    )

    if (res.code && res.code !== '0') {
      throw new Error(`Daraz API error: ${res.code} — ${res.message ?? 'unknown'}`)
    }

    const container = res.data ?? {}
    const items = (container[resourceKey] as T[] | undefined) ?? []
    const totalCount =
      (container['total_products'] as number | undefined) ??
      (container['count_total'] as number | undefined) ??
      undefined

    return { items, totalCount }
  }
}
