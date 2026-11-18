/**
 * Alibaba.com Open Platform HTTP client.
 *
 * docId=61: the request goes to https://openapi-api.alibaba.com/rest/{api_path}
 * with every parameter, `sign` included, URL-encoded; "All API operations can
 * be called with requests using "POST"." Parameters go in an
 * application/x-www-form-urlencoded body ("All parameter values in the HTTP
 * body should also be encoded If the requested content type is application /
 * x-www-form-urlencoded").
 *
 * Every documented response carries a top-level `code`, "0" in each
 * documented example, and the first-party IOP SDK linked from each API page
 * (sdkDownloadsLink, com.global.iop.util.Constants) reads a failed call's
 * `code`, `type`, `message` and `request_id` from the same level.
 *
 * Retry: exponential back-off on 429 and 5xx (4 retries).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildSignedParams } from './auth'
import { ALIBABA_REST_BASE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
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

/** The gateway-level fields every response carries. */
export interface AlibabaEnvelope {
  code?: string | number
  type?: string
  message?: string
  request_id?: string
}

export type ApiParams = Record<string, string | number | boolean | object | undefined>

export class AlibabaClient {
  private http: AxiosInstance
  private appKey: string
  private appSecret: string
  private accessToken: string

  constructor(credentials: Credentials) {
    this.appKey = (credentials.extra?.['appKey'] as string | undefined) ?? ''
    this.appSecret = (credentials.extra?.['appSecret'] as string | undefined) ?? ''
    this.accessToken = credentials.accessToken ?? ''
    if (!this.appKey || !this.appSecret) {
      throw new Error('AlibabaClient: credentials.extra must contain appKey and appSecret.')
    }
    if (!this.accessToken) {
      throw new Error('AlibabaClient: credentials.accessToken is required.')
    }
    this.http = axios.create({
      baseURL: ALIBABA_REST_BASE,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Call the API at `apiPath` (e.g. `/alibaba/order/list`). Returns the whole
   * response body; throws when the gateway's `code` is not "0".
   */
  async call<T extends object>(
    apiPath: string,
    params: ApiParams = {},
  ): Promise<T & AlibabaEnvelope> {
    return withRetry(async () => {
      const body = buildSignedParams(apiPath, this.appKey, this.appSecret, this.accessToken, params)
      const { data } = await this.http.post<T & AlibabaEnvelope>(
        apiPath,
        new URLSearchParams(body).toString(),
      )
      if (data == null || String(data.code) !== '0') {
        throw new Error(
          `Alibaba ${apiPath} failed: ${data?.code ?? 'no code'}${data?.message ? ` — ${data.message}` : ''}`,
        )
      }
      return data
    })
  }
}
