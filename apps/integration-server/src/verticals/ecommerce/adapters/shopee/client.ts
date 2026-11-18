/**
 * Shopee Open Platform HTTP client with HMAC-SHA256 request-signing interceptor.
 *
 * Key differences from other adapters in this project:
 *
 *   - Auth is via **query-parameter signing**, not headers. Every request
 *     carries `partner_id`, `timestamp`, `access_token`, `shop_id`, and
 *     `sign` as query parameters.
 *   - The `sign` parameter is HMAC-SHA256 of
 *     `{partner_id}{api_path}{timestamp}{access_token}{shop_id}` using
 *     `partner_key` as the HMAC secret.
 *   - Pagination uses `offset` + `page_size` with a `more` boolean flag
 *     and optional `next_offset` in the response.
 */

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { computeSignature } from './auth'
import { BASE_URL, API_PREFIX, DEFAULT_PAGE_SIZE } from './constants'

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

export interface ShopeeListResult<T> {
  items: T[]
  more: boolean
  nextOffset?: number
}

export class ShopeeClient {
  private http: AxiosInstance
  private partnerId: number
  private partnerKey: string
  private shopId: number
  private accessToken: string

  constructor(credentials: Credentials) {
    const partnerId = credentials.extra?.['partnerId'] as number | undefined
    const partnerKey = credentials.extra?.['partnerKey'] as string | undefined
    const shopId = credentials.extra?.['shopId'] as number | undefined

    if (!partnerId || !partnerKey || !shopId) {
      throw new Error(
        'ShopeeClient requires partnerId, partnerKey, and shopId in credentials.extra.',
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'ShopeeClient requires credentials.accessToken — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }

    this.partnerId = partnerId
    this.partnerKey = partnerKey
    this.shopId = shopId
    this.accessToken = credentials.accessToken

    this.http = axios.create({
      baseURL: `${BASE_URL}${API_PREFIX}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })

    // ── HMAC-SHA256 request-signing interceptor ────────────────────────────
    // This is the key differentiator: every request gets auth query params
    // appended automatically.
    this.http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const timestamp = Math.floor(Date.now() / 1000)
      // Compute the full API path for signature: /api/v2 + endpoint path
      const apiPath = `${API_PREFIX}${config.url ?? ''}`
      const sign = computeSignature(
        this.partnerKey,
        this.partnerId,
        apiPath,
        timestamp,
        this.accessToken,
        this.shopId,
      )

      // Append auth params to the query string
      config.params = {
        ...config.params,
        partner_id: this.partnerId,
        timestamp,
        access_token: this.accessToken,
        shop_id: this.shopId,
        sign,
      }

      return config
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  /**
   * List helper for Shopee's offset-based pagination. Returns items from
   * the specified `resourceKey` plus pagination state.
   */
  async listPaginated<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ShopeeListResult<T>> {
    const params: Record<string, unknown> = {
      page_size: (extraParams['page_size'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      ...extraParams,
    }

    const data = await this.get<Record<string, unknown>>(path, params)
    const response = (data['response'] ?? data) as Record<string, unknown>

    let items: T[] = []
    if (Array.isArray(response[resourceKey])) {
      items = response[resourceKey] as T[]
    }

    const more = (response['more'] as boolean | undefined) ?? false
    const nextOffset = response['next_offset'] as number | undefined

    return { items, more, nextOffset }
  }
}
