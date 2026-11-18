/**
 * JD.com Open Platform HTTP client with HMAC-MD5 request-signing interceptor.
 *
 * JD uses a **gateway pattern**: all requests go to a single URL
 * (`https://api.jd.com/routerjson`) with a `method` parameter that
 * selects the API endpoint. Parameters are sent as form-urlencoded POST.
 *
 * Signing algorithm:
 *   1. Collect all params (method, app_key, access_token, timestamp, v, 360buy_param_json, ...)
 *   2. Sort alphabetically by key
 *   3. Concatenate: appSecret + key1value1 + key2value2 + ... + appSecret
 *   4. MD5 hash → uppercase hex → `sign` param
 *
 * This is similar to the Lazada/Shopee signing pattern but uses MD5
 * instead of SHA-256 and wraps the secret around the concatenation.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { computeSignature } from './auth'
import { GATEWAY_URL } from './constants'

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

/** Standard JD.com API response envelope. */
export interface JdApiResponse {
  code?: string
  error_response?: {
    code?: string
    zh_desc?: string
    en_desc?: string
  }
  [key: string]: unknown
  // The actual response key varies by method, e.g. `jingdong_sku_read_responce`
}

export class JdClient {
  private http: AxiosInstance
  private appKey: string
  private appSecret: string
  private accessToken: string

  constructor(credentials: Credentials) {
    this.appKey = (credentials.extra?.['appKey'] as string) ?? ''
    this.appSecret = (credentials.extra?.['appSecret'] as string) ?? ''
    this.accessToken = credentials.accessToken ?? ''

    if (!this.appKey || !this.appSecret) {
      throw new Error(
        'JdClient: credentials.extra must contain appKey and appSecret.',
      )
    }
    if (!this.accessToken) {
      throw new Error(
        'JdClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }

    this.http = axios.create({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Execute a JD.com API method call.
   *
   * All JD API calls are POST to the gateway URL with form-urlencoded params.
   * The `method` param selects the API (e.g. `jingdong.sku.read`).
   *
   * @param method   The JD API method name
   * @param bizParams Business parameters to send as `360buy_param_json`
   * @returns The parsed JSON response
   */
  async execute<T = Record<string, unknown>>(
    method: string,
    bizParams: Record<string, unknown> = {},
  ): Promise<T> {
    return withRetry(async () => {
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)
      const paramJson = JSON.stringify(bizParams)

      const params: Record<string, string> = {
        method,
        app_key: this.appKey,
        access_token: this.accessToken,
        timestamp,
        v: '2.0',
        '360buy_param_json': paramJson,
      }

      const sign = computeSignature(params, this.appSecret)

      const formData = new URLSearchParams({
        ...params,
        sign,
      })

      const { data } = await this.http.post<T>(GATEWAY_URL, formData.toString())

      // Check for error response
      const response = data as JdApiResponse
      if (response.error_response) {
        const err = response.error_response
        throw new Error(
          `JD.com API error [${err.code ?? 'unknown'}]: ${err.zh_desc ?? err.en_desc ?? 'unknown error'}`,
        )
      }

      return data
    })
  }
}
