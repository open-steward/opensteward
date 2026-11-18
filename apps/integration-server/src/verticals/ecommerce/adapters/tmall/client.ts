/**
 * Tmall / Taobao Open Platform (TOP) HTTP client.
 *
 * All TOP API calls are HTTP POST to a single endpoint
 * (https://eco.taobao.com/router/rest). The `method` param selects the
 * operation. Every request must be signed via the TOP MD5 algorithm.
 *
 * The client assembles the full param set (including signature) on each
 * call using `buildRequestParams` from auth.ts and submits them as a
 * URL-encoded form body.
 *
 * Retry logic: exponential back-off for 429 and 5xx responses (4 retries).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildRequestParams, TOP_ENDPOINT } from './auth'
import { DEFAULT_PAGE_SIZE } from './constants'

// ── Retry ─────────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && attempt < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

// ── TOP response envelope ─────────────────────────────────────────────────────

export interface TopResponse<T = unknown> {
  /** Present when TOP returns an error. */
  error_response?: {
    code: number
    msg: string
    sub_code?: string
    sub_msg?: string
    request_id?: string
  }
  /** The actual result is nested under a method-specific key. */
  [key: string]: T | undefined | { code: number; msg: string; sub_code?: string; sub_msg?: string; request_id?: string }
}

export interface ListResult<T> {
  items: T[]
  totalCount?: number
}

// ── Client ────────────────────────────────────────────────────────────────────

export class TmallClient {
  private http: AxiosInstance
  private appKey: string
  private appSecret: string
  private accessToken: string

  constructor(credentials: Credentials) {
    this.appKey = (credentials.extra?.['appKey'] as string | undefined) ?? ''
    this.appSecret = (credentials.extra?.['appSecret'] as string | undefined) ?? ''
    this.accessToken = credentials.accessToken ?? ''

    if (!this.appKey || !this.appSecret) {
      throw new Error(
        'TmallClient: credentials.extra must contain appKey and appSecret.',
      )
    }
    if (!this.accessToken) {
      throw new Error(
        'TmallClient: credentials.accessToken (session_key) is required — ' +
          'the auth middleware should have refreshed the token before instantiating the client.',
      )
    }

    this.http = axios.create({
      baseURL: TOP_ENDPOINT,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Call a TOP API method.
   *
   * @param method  TOP method name (e.g. `taobao.trades.sold.get`)
   * @param params  Method-specific params (values will be stringified)
   * @returns       Parsed response body (the full TOP envelope)
   */
  async call<T>(
    method: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<TopResponse<T>> {
    const body = buildRequestParams(
      method,
      this.appKey,
      this.appSecret,
      this.accessToken,
      params,
    )
    const encoded = new URLSearchParams(body).toString()

    return withRetry(async () => {
      const { data } = await this.http.post<TopResponse<T>>('', encoded)
      if (data.error_response) {
        const e = data.error_response
        throw new Error(
          `TOP API error ${e.code} (${e.sub_code ?? method}): ${e.sub_msg ?? e.msg}`,
        )
      }
      return data
    })
  }

  /**
   * Extract the first non-`error_response` value from a TOP response.
   * TOP wraps results under a method-derived key such as `trades_sold_get_response`.
   */
  extractResult<T>(res: TopResponse<T>): T {
    for (const [key, value] of Object.entries(res)) {
      if (key !== 'error_response' && value !== undefined) {
        return value as T
      }
    }
    throw new Error('TmallClient: TOP response contained no result key')
  }

  /**
   * Paginated list helper for TOP endpoints.
   *
   * @param method       TOP method name
   * @param resultKey    The key inside the result object that holds the array (e.g. `trades`)
   * @param totalKey     The key inside the result object for the total count (e.g. `total_results`)
   * @param params       Additional method-specific params
   * @param pageSize     Number of items per page (default: DEFAULT_PAGE_SIZE)
   * @param pageNo       1-based page number (default: 1)
   */
  async list<T>(
    method: string,
    resultKey: string,
    totalKey: string,
    params: Record<string, string | number | boolean | undefined> = {},
    pageSize = DEFAULT_PAGE_SIZE,
    pageNo = 1,
  ): Promise<ListResult<T>> {
    const res = await this.call<Record<string, unknown>>(method, {
      ...params,
      page_size: pageSize,
      page_no: pageNo,
    })
    const result = this.extractResult<Record<string, unknown>>(res)
    const items = (result[resultKey] as T[] | undefined) ?? []
    const totalCount = result[totalKey] as number | undefined
    return { items, totalCount }
  }
}
