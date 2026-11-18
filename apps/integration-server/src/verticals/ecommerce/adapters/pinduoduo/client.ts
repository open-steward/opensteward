/**
 * Pinduoduo Open Platform HTTP client.
 *
 * All PDD API calls are HTTP POST to a single endpoint
 * (https://open-api.pinduoduo.com/api/router). The `type` param selects the
 * operation. Every request must be signed via the PDD MD5 algorithm.
 *
 * The client assembles the full param set (including signature) on each call
 * using `buildRequestParams` from auth.ts and submits them as a URL-encoded
 * form body.
 *
 * Retry logic: exponential back-off for 429 and 5xx responses (4 retries).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildRequestParams, extractPddCredentials, PDD_ENDPOINT } from './auth'
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

// ── PDD response envelope ─────────────────────────────────────────────────────

/**
 * Standard PDD API response envelope. Errors are encoded in `error_response`.
 * Successful results are nested under a method-derived key.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface PddResponse<T = unknown> {
  error_response?: {
    /** PDD error code. */
    error_code: number
    /** Chinese error message. */
    zh_desc: string
    /** English error message. */
    en_desc?: string
    request_id?: string
    sub_code?: string
    sub_msg?: string
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface PddListResult<T> {
  items: T[]
  totalCount?: number
}

// ── Client ────────────────────────────────────────────────────────────────────

export class PinduoduoClient {
  private http: AxiosInstance
  private clientId: string
  private clientSecret: string

  constructor(credentials: Credentials) {
    const { clientId, clientSecret } = extractPddCredentials(credentials)
    this.clientId = clientId
    this.clientSecret = clientSecret

    this.http = axios.create({
      baseURL: PDD_ENDPOINT,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Call a PDD API method.
   *
   * @param type    PDD method name (e.g. `pdd.goods.list.get`)
   * @param params  Method-specific params (values will be stringified)
   * @returns       Parsed response body (full PDD envelope)
   */
  async call<T>(
    type: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<PddResponse<T>> {
    const body = buildRequestParams(type, this.clientId, this.clientSecret, params)
    const encoded = new URLSearchParams(body).toString()

    return withRetry(async () => {
      const { data } = await this.http.post<PddResponse<T>>('', encoded)
      if (data.error_response) {
        const e = data.error_response
        throw new Error(
          `PDD API error ${e.error_code}: ${e.en_desc ?? e.zh_desc}`,
        )
      }
      return data
    })
  }

  /**
   * Extract the first non-system value from a PDD response.
   *
   * PDD wraps results under a method-derived key such as
   * `goods_list_get_response` or `order_info_get_response`.
   */
  extractResult<T>(res: PddResponse<T>): T {
    for (const [key, value] of Object.entries(res)) {
      if (key !== 'error_response' && key !== 'request_id' && value !== undefined) {
        return value as T
      }
    }
    throw new Error('PinduoduoClient: PDD response contained no result key')
  }

  /**
   * Paginated list helper for PDD list endpoints.
   *
   * @param type         PDD method name
   * @param resultKey    Key inside the result object that holds the array
   * @param totalKey     Key inside the result object for the total count
   * @param params       Additional method-specific params
   * @param pageSize     Number of items per page (default: DEFAULT_PAGE_SIZE)
   * @param pageNum      1-based page number (default: 1)
   */
  async list<T>(
    type: string,
    resultKey: string,
    totalKey: string,
    params: Record<string, string | number | boolean | undefined> = {},
    pageSize = DEFAULT_PAGE_SIZE,
    pageNum = 1,
  ): Promise<PddListResult<T>> {
    const res = await this.call<Record<string, unknown>>(type, {
      ...params,
      page_size: pageSize,
      page_num: pageNum,
    })
    const result = this.extractResult<Record<string, unknown>>(res)
    const items = (result[resultKey] as T[] | undefined) ?? []
    const totalCount = result[totalKey] as number | undefined
    return { items, totalCount }
  }
}
