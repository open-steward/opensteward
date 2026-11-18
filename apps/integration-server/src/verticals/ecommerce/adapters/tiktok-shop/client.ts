/**
 * TikTok Shop HTTP client with HMAC-SHA256 request-signing interceptor.
 *
 * Key differences from other adapters in this project:
 *
 *   - Auth uses **HMAC-SHA256 request signing** on every request, similar to Shopee.
 *   - The `sign` query parameter is HMAC-SHA256 of
 *     `app_secret + path + sorted_params + body + app_secret` using
 *     `app_secret` as the HMAC key.
 *   - Every request carries `app_key`, `timestamp`, `sign`, `shop_cipher`,
 *     and `access_token` as query parameters.
 *   - Pagination uses `page_token` (cursor-based) with a `total_count` in responses.
 */

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { computeSignature } from './auth'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

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

export interface TikTokListResult<T> {
  items: T[]
  totalCount: number
  nextPageToken?: string
}

export class TikTokShopClient {
  private http: AxiosInstance
  private appKey: string
  private appSecret: string
  private shopCipher: string
  private accessToken: string

  constructor(credentials: Credentials) {
    const appKey = credentials.extra?.['appKey'] as string | undefined
    const appSecret = credentials.extra?.['appSecret'] as string | undefined
    const shopCipher = credentials.extra?.['shopCipher'] as string | undefined

    if (!appKey || !appSecret) {
      throw new Error(
        'TikTokShopClient requires appKey and appSecret in credentials.extra.',
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'TikTokShopClient requires credentials.accessToken — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }

    this.appKey = appKey
    this.appSecret = appSecret
    this.shopCipher = shopCipher ?? ''
    this.accessToken = credentials.accessToken

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-tts-access-token': this.accessToken,
      },
      timeout: 30_000,
    })

    // ── HMAC-SHA256 request-signing interceptor ────────────────────────────
    this.http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const timestamp = Math.floor(Date.now() / 1000)
      const path = config.url ?? ''

      // Build the query params map for signing
      const queryParams: Record<string, string> = {
        app_key: this.appKey,
        timestamp: String(timestamp),
        ...(this.shopCipher ? { shop_cipher: this.shopCipher } : {}),
      }

      // Include any existing params
      if (config.params) {
        for (const [k, v] of Object.entries(config.params as Record<string, unknown>)) {
          if (v != null) queryParams[k] = String(v)
        }
      }

      // Get body string for signing
      const bodyString = config.data ? JSON.stringify(config.data) : undefined

      const sign = computeSignature(this.appSecret, path, queryParams, bodyString)

      // Set all query params including sign and access_token
      config.params = {
        ...queryParams,
        sign,
        access_token: this.accessToken,
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

  /**
   * `params` go in the query string, where the signing interceptor folds them
   * into the signature. The 202309 search endpoints (products, orders,
   * returns) take `page_size` and `page_token` there, not in the body.
   */
  async post<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, params ? { params } : undefined)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }

  /**
   * List helper for TikTok Shop's cursor-based pagination.
   */
  async listPaginated<T>(
    path: string,
    resourceKey: string,
    body: Record<string, unknown> = {},
  ): Promise<TikTokListResult<T>> {
    const pageSize = (body['page_size'] as number | undefined) ?? DEFAULT_PAGE_SIZE

    const data = await this.post<Record<string, unknown>>(path, {
      ...body,
      page_size: pageSize,
    })

    const responseData = (data['data'] ?? data) as Record<string, unknown>

    let items: T[] = []
    if (Array.isArray(responseData[resourceKey])) {
      items = responseData[resourceKey] as T[]
    }

    const totalCount = (responseData['total_count'] as number | undefined) ?? 0
    const nextPageToken = responseData['next_page_token'] as string | undefined

    return { items, totalCount, nextPageToken }
  }
}
