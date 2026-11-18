/**
 * Jushuitan (聚水潭) Open Platform HTTP client.
 *
 * All requests are POST to https://openapi.jushuitan.com/<path>.
 * Parameters are form-encoded; business params go into `biz` as a JSON string.
 * Signature: MD5(appSecret + ksort(key+value) of top-level params excluding `sign`).
 * Reference: https://github.com/itroadhd/jushuitan-open-api-sdk (Client.php)
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION, API_CHARSET } from './constants'

/** Response envelope from all Jushuitan API calls. */
export interface JushuitanResponse<T = unknown> {
  code: number
  msg?: string
  data?: T
  datas?: T
}

function generateSign(appSecret: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort()
  let str = appSecret
  for (const key of sorted) {
    str += key + (params[key] ?? '')
  }
  return createHash('md5').update(str, 'utf8').digest('hex')
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class JushuitanClient {
  private http: AxiosInstance
  private appKey: string
  private appSecret: string
  private accessToken: string

  constructor(credentials: Credentials) {
    const appKey = String(credentials.extra?.['appKey'] ?? '')
    const appSecret = String(credentials.extra?.['appSecret'] ?? '')
    if (!appKey) throw new Error('jushuitan requires credentials.extra.appKey')
    if (!appSecret) throw new Error('jushuitan requires credentials.extra.appSecret')
    if (!credentials.accessToken) throw new Error('jushuitan requires credentials.accessToken')

    this.appKey = appKey
    this.appSecret = appSecret
    this.accessToken = credentials.accessToken

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST to `path` with Jushuitan-style form encoding.
   * `bizParams` are JSON-serialised into the `biz` field.
   * Returns the `data` (or `datas`) field from the envelope, or throws on error.
   */
  async post<T>(path: string, bizParams: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const timestamp = String(Math.floor(Date.now() / 1000))
      const biz = JSON.stringify(bizParams)

      // Build top-level params (everything except `sign`)
      const baseParams: Record<string, string> = {
        app_key: this.appKey,
        access_token: this.accessToken,
        timestamp,
        version: API_VERSION,
        charset: API_CHARSET,
        biz,
      }

      const sign = generateSign(this.appSecret, baseParams)

      const formBody = new URLSearchParams({
        ...baseParams,
        sign,
      })

      const { data } = await this.http.post<JushuitanResponse<T>>(path, formBody.toString())

      if (data.code !== 0) {
        throw new Error(`jushuitan API error ${data.code}: ${data.msg ?? 'unknown error'} (path=${path})`)
      }

      // The response may use `data` or `datas` depending on the endpoint
      return (data.data ?? data.datas) as T
    })
  }
}
