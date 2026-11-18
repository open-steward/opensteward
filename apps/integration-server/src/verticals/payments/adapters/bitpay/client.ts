/**
 * BitPay REST API client — thin axios wrapper for the `pos` facade.
 *
 * The token is not an `Authorization` header: BitPay carries it inline. For
 * GET requests it is appended as the `token` query param; for POST it is folded
 * into the JSON body. We do that automatically so callers never have to thread
 * the token through every call. The API version is pinned via the
 * `X-Accept-Version` header.
 *
 * List endpoints return a `{ data: T[] }` envelope and paginate with
 * `limit` / `offset` over a `dateStart`..`dateEnd` window.
 *
 * Docs: https://developer.bitpay.com/reference/concepts
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, baseUrlForEnvironment } from './constants'
import { environmentOf } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** BitPay list endpoints wrap results in `{ facade, data: T[] }`. */
export interface BitpayListResponse<T> {
  facade?: string
  data?: T[]
}

/** BitPay single-resource endpoints wrap the object in `{ facade, data: T }`. */
export interface BitpayObjectResponse<T> {
  facade?: string
  data?: T
}

export class BitpayClient {
  private http: AxiosInstance
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: baseUrlForEnvironment(environmentOf(credentials)),
      headers: {
        'X-Accept-Version': API_VERSION,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () =>
        (await this.http.get<T>(path, { params: { ...params, token: this.token } })).data,
    )
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () => (await this.http.post<T>(path, { ...body, token: this.token })).data,
    )
  }
}
