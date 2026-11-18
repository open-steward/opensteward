/**
 * Wish Merchant API clients.
 *
 * `WishV3Client` serves every read. `WishClient` is the legacy v2 client the
 * write methods still use; every /api/v2 path now answers 404 (see
 * constants.ts), and those methods are outside the read rebuild.
 *
 * Legacy v2 client:
 *
 * Features:
 *  - `Authorization: Bearer <token>` auth header on every request.
 *  - All Wish API responses are wrapped in:
 *      `{ code: 0, data: { ... } }` on success,
 *      `{ code: <non-zero>, message: "..." }` on error.
 *  - 429 / 5xx retry with exponential backoff via `withRetry` from shared.
 *
 * Endpoint pattern (v2):
 *   GET  https://merchant.wish.com/api/v2/<resource>          (single fetch)
 *   GET  https://merchant.wish.com/api/v2/<resource>/multi-get (paginated list)
 *   POST https://merchant.wish.com/api/v2/<resource>/add       (create)
 *   POST https://merchant.wish.com/api/v2/<resource>/update    (update)
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { PROD_BASE_URL, SANDBOX_BASE_URL, V3_PROD_HOST, V3_SANDBOX_HOST } from './constants'

/** Canonical Wish API response envelope. */
export interface WishEnvelope<T> {
  code: number
  message?: string
  data?: T
}

export class WishClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, sandbox = false) {
    this.http = axios.create({
      baseURL: sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Unwrap a Wish envelope, throwing on non-zero codes. */
  private unwrap<T>(envelope: WishEnvelope<T>): T {
    if (envelope.code !== 0) {
      throw new Error(`Wish API error ${envelope.code}: ${envelope.message ?? 'unknown'}`)
    }
    if (envelope.data === undefined) {
      throw new Error('Wish API returned success code with missing data')
    }
    return envelope.data
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<WishEnvelope<T>>(path, { params })
      return this.unwrap(data)
    })
  }

  /**
   * Wish Merchant API v2 requires all write operations to use
   * `application/x-www-form-urlencoded` encoding, not JSON.
   * Serialize the body as URLSearchParams before sending.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const encoded = body
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(body)
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => [k, String(v)]),
            ),
          ).toString()
        : ''
      const { data } = await this.http.post<WishEnvelope<T>>(path, encoded, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return this.unwrap(data)
    })
  }
}

/**
 * Wish Merchant API v3 client (reads).
 *
 * Auth, per the v3 reference: "the access token must be provided in the
 * `Authorization` request header in the following format:
 * `Authorization: Bearer <token>`".
 *
 * Envelope, per the same reference: "Every response returned from the Wish API
 * will have the same schema. … Each response will have the following top level
 * attributes: message, code and data." — `code` is "A unique number which
 * represents the error that has occurred, example: 1008 or 0 if success."
 * A response that is not that envelope is an error, never an empty list: an
 * empty list tells the sync the collection is empty.
 */
export class WishV3Client {
  private http: AxiosInstance

  constructor(credentials: Credentials, sandbox = false) {
    this.http = axios.create({
      baseURL: sandbox ? V3_SANDBOX_HOST : V3_PROD_HOST,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      // Array query params (`statuses`) declare no `style`/`explode`, so they
      // take OpenAPI's query default, form + explode: `statuses=A&statuses=B`,
      // not axios's default `statuses[]=A`.
      paramsSerializer: { indexes: null },
      timeout: 30_000,
    })
  }

  /** GET an /api/v3 path and return the envelope's `data`. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const body = await withRetry(async () => {
      const { data } = await this.http.get<WishEnvelope<T>>(path, params ? { params } : undefined)
      return data
    })
    if (body === null || typeof body !== 'object' || typeof body.code !== 'number') {
      throw new Error(
        `Wish API: GET ${path} did not return the documented {message, code, data} envelope`,
      )
    }
    if (body.code !== 0) {
      throw new Error(`Wish API error ${body.code}: ${body.message ?? '(no message)'}`)
    }
    if (body.data === undefined || body.data === null) {
      throw new Error(`Wish API: GET ${path} returned code 0 without data`)
    }
    return body.data
  }
}
