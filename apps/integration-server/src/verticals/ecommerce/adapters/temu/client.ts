/**
 * Temu Open Platform API client.
 *
 * Every rule below is from Temu's partner docs (fetched 2026-09-25 as JSON
 * from POST https://partner-us.temu.com/riemann/api/v2/menu/document/detail
 * and /riemann/api/v2/api/doc/detail/get):
 *
 *  - "Currently, we only support the POST method for API interaction", to one
 *    router host per region ("Endpoints and Request Method").
 *  - Common parameters ("Common Parameters"): `type`, `app_key`,
 *    `access_token`, `sign`, `data_type` ("fixed as JSON") and
 *    `timestamp`: "Timestamp, in UNIX time format (seconds), 10 digits long,
 *    current time - 300 seconds <= input time <= current time + 300 seconds".
 *    `version`: "If no requirement is set, this parameter is not passed."
 *  - Signature ("Signature Method for API request"): "All request parameters
 *    (including common parameters and request parameters) in this request are
 *    sorted in ascending order", concatenated as key+value with no separators,
 *    `app_secret` "at the head and tail", MD5, "converted to uppercase". The
 *    guide's worked example concatenates an array parameter as its JSON text
 *    (`sendRequestList[{"orderSendInfoList":...}]`).
 *  - Response envelope (every API page): "success [BOOLEAN] :: Current request
 *    success status", "errorCode [INTEGER]", "errorMsg [STRING]", and
 *    `result`.
 *
 * Paging is per endpoint (pageNo / pageNumber, different maxima), so it lives
 * in the adapter, not here.
 */

import axios, { type AxiosInstance } from 'axios'
import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL, DATA_TYPE } from './constants'

// ── Signature ─────────────────────────────────────────────────────────────────

/** A parameter's value as the signature concatenates it: arrays and objects as JSON. */
function signValue(v: unknown): string {
  if (v !== null && typeof v === 'object') return JSON.stringify(v)
  return String(v ?? '')
}

/**
 * Compute the Temu request signature.
 *
 * Algorithm: MD5(appSecret + sorted(key+value pairs) + appSecret), uppercase.
 */
export function computeSign(params: Record<string, unknown>, appSecret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}${signValue(params[k])}`)
    .join('')

  return createHash('md5').update(`${appSecret}${sorted}${appSecret}`).digest('hex').toUpperCase()
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** The documented response envelope. */
export interface TemuEnvelope<T> {
  success?: boolean
  errorCode?: number
  errorMsg?: string
  result?: T
}

/** A response whose `success` was not true. */
export class TemuApiError extends Error {
  constructor(
    readonly type: string,
    readonly errorCode: number | undefined,
    readonly errorMsg: string | undefined,
  ) {
    super(`Temu ${type} failed: errorCode ${String(errorCode)}${errorMsg ? `: ${errorMsg}` : ''}`)
    this.name = 'TemuApiError'
  }
}

// ── Client ────────────────────────────────────────────────────────────────────

export class TemuClient {
  private http: AxiosInstance
  private appKey: string
  private appSecret: string
  private accessToken: string

  constructor(credentials: Credentials, baseUrl: string = DEFAULT_BASE_URL) {
    this.accessToken = credentials.accessToken
    this.appKey = (credentials.extra?.['appKey'] as string | undefined) ?? ''
    this.appSecret = (credentials.extra?.['appSecret'] as string | undefined) ?? ''

    if (!this.appKey || !this.appSecret) {
      throw new Error(
        'TemuClient: credentials.extra.appKey and credentials.extra.appSecret are required. ' +
          'POST to /v1/connections with credentials: { accessToken, extra: { appKey, appSecret } }.',
      )
    }

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** The signed request body: common parameters plus the API's own, and `sign`. */
  buildBody(type: string, params: Record<string, unknown>): Record<string, unknown> {
    const all: Record<string, unknown> = {
      ...params,
      type,
      app_key: this.appKey,
      access_token: this.accessToken,
      timestamp: Math.floor(Date.now() / 1000),
      data_type: DATA_TYPE,
    }
    return { ...all, sign: computeSign(all, this.appSecret) }
  }

  /**
   * Execute a Temu API method and return its `result`. Throws
   * {@link TemuApiError} when `success` is not true.
   */
  async call<T>(type: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const body = this.buildBody(type, params)
      const { data } = await this.http.post<TemuEnvelope<T>>('', body)
      if (data?.success !== true) throw new TemuApiError(type, data?.errorCode, data?.errorMsg)
      return data.result as T
    })
  }
}

// ── withRetry ─────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
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
