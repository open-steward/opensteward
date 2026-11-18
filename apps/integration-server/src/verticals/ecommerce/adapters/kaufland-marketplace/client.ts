/**
 * Kaufland Marketplace Seller API client.
 *
 * Features:
 *  - Per-request HMAC-SHA256 signature in Shop-Signature header.
 *  - Shop-Client-Key, Shop-Timestamp, Shop-Signature, User-Agent headers on
 *    every request (Kaufland mandatory).
 *  - 429 retry with exponential backoff (Kaufland rate limit is ~2 req/s per
 *    endpoint; Retry-After header is honoured when present).
 *  - Offset-based pagination via `listWithOffset`.
 *
 * Docs: https://sellerapi.kaufland.com/?page=rest-api
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, USER_AGENT } from './constants'
import { buildSignature } from './auth'

/** Kaufland list responses wrap items in `{ data: [...], pagination: {...} }`. */
export interface KauflandListResponse<T> {
  data: T[]
  pagination?: {
    offset?: number
    limit?: number
    total?: number
  }
}

/** A single-item Kaufland response wraps the object under `data`. */
export interface KauflandItemResponse<T> {
  data: T
}

export interface ListResult<T> {
  items: T[]
  total?: number
  nextOffset?: number
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        // Honour Retry-After if present; otherwise exponential backoff.
        const retryAfter = axiosErr.response?.headers['retry-after']
        const delay = retryAfter
          ? parseInt(String(retryAfter), 10) * 1000
          : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class KauflandMarketplaceClient {
  private http: AxiosInstance
  private clientKey: string
  private secretKey: string
  private baseUrl: string

  constructor(credentials: Credentials, sandbox = false) {
    // Kaufland credentials: clientKey in accessToken, secretKey in extra.secretKey
    this.clientKey = credentials.accessToken
    this.secretKey = (credentials.extra?.['secretKey'] as string | undefined) ?? ''
    this.baseUrl = sandbox ? 'https://sellerapi-playground.kaufland.com/v2' : API_BASE_URL

    if (!this.clientKey) {
      throw new Error(
        'KauflandMarketplaceClient: credentials.accessToken (clientKey) is required',
      )
    }
    if (!this.secretKey) {
      throw new Error(
        'KauflandMarketplaceClient: credentials.extra.secretKey is required',
      )
    }

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30_000,
    })
  }

  /**
   * Build the per-request auth headers that Kaufland requires on every call.
   * The signature covers METHOD, full URI, body, and timestamp.
   */
  private authHeaders(
    method: string,
    path: string,
    body: string,
    timestamp: number,
    params?: Record<string, unknown>,
  ): Record<string, string> {
    // Build full URI including query params for the signature.
    const queryString = params && Object.keys(params).length > 0
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
          ),
        ).toString()
      : ''
    const uri = `${this.baseUrl}/${path.replace(/^\//, '')}${queryString}`
    const signature = buildSignature(method, uri, body, timestamp, this.secretKey)
    return {
      Accept: 'application/json',
      'Shop-Client-Key': this.clientKey,
      'Shop-Timestamp': String(timestamp),
      'Shop-Signature': signature,
      'User-Agent': USER_AGENT,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const ts = Math.floor(Date.now() / 1000)
      const headers = this.authHeaders('GET', path, '', ts, params)
      const { data } = await this.http.get<T>(path, { params, headers })
      return data
    })
  }

  async post<T>(path: string, body: unknown = {}): Promise<T> {
    return withRetry(async () => {
      const ts = Math.floor(Date.now() / 1000)
      const bodyStr = JSON.stringify(body)
      const headers = {
        ...this.authHeaders('POST', path, bodyStr, ts),
        'Content-Type': 'application/json',
      }
      const { data } = await this.http.post<T>(path, body, { headers })
      return data
    })
  }

  async patch<T>(path: string, body: unknown = {}): Promise<T> {
    return withRetry(async () => {
      const ts = Math.floor(Date.now() / 1000)
      const bodyStr = JSON.stringify(body)
      const headers = {
        ...this.authHeaders('PATCH', path, bodyStr, ts),
        'Content-Type': 'application/json',
      }
      const { data } = await this.http.patch<T>(path, body, { headers })
      return data
    })
  }

  async put<T>(path: string, body: unknown = {}): Promise<T> {
    return withRetry(async () => {
      const ts = Math.floor(Date.now() / 1000)
      const bodyStr = JSON.stringify(body)
      const headers = {
        ...this.authHeaders('PUT', path, bodyStr, ts),
        'Content-Type': 'application/json',
      }
      const { data } = await this.http.put<T>(path, body, { headers })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      const ts = Math.floor(Date.now() / 1000)
      const headers = this.authHeaders('DELETE', path, '', ts)
      await this.http.delete(path, { headers })
    })
  }

  /**
   * Offset-based list helper. Kaufland collection responses have the shape:
   *   { data: T[], pagination: { offset, limit, total } }
   *
   * Returns items plus the next offset (undefined if no more pages).
   */
  async listWithOffset<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams['offset'] as number | undefined) ?? 0
    const params: Record<string, unknown> = { ...extraParams, limit, offset }

    const res = await this.get<KauflandListResponse<T>>(path, params)
    const total = res.pagination?.total
    const nextOffset = offset + limit < (total ?? 0) ? offset + limit : undefined

    return {
      items: res.data ?? [],
      total,
      nextOffset,
    }
  }
}
