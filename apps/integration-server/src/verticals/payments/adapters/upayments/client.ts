import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

/**
 * https://developers.upayments.com/reference/hmac-authentication.md:
 * "The payload is a concatenated string formed as follows: timestamp +
 * HTTP_METHOD + API_PATH + REQUEST_BODY", "signature =
 * Base64Encode(HMAC_SHA256(payload, API_SECRET))", "Use the path immediately
 * following /api/v1/ when generating the signature (e.g., use `charge` for the
 * Charge endpoint)" and "For GET requests (such as `Get Payment Status`), use
 * an empty string for the request body portion of the payload".
 */
export function upaymentsSignature(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  apiSecret: string,
): string {
  return createHmac('sha256', apiSecret)
    .update(timestamp + method + path + body)
    .digest('base64')
}

export class UpaymentsClient {
  private http: AxiosInstance
  private apiSecret: string

  constructor(credentials: Credentials) {
    const secret = credentials.extra?.['apiSecret']
    if (!credentials.accessToken || typeof secret !== 'string' || !secret) {
      throw Object.assign(
        new Error(
          'UPayments signs every request with the API Secret Key, and this connection has none. Reconnect with both the API Key and the API Secret Key.',
        ),
        { statusCode: 401 },
      )
    }
    this.apiSecret = secret
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Signed fresh on every attempt: "signatures are only valid for a
   * **1-minute window** from the provided timestamp".
   */
  private headers(method: string, path: string, body: string): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000))
    return {
      'X-Timestamp': timestamp,
      'X-Signature': upaymentsSignature(timestamp, method, path, body, this.apiSecret),
    }
  }

  /** `path` is relative to /api/v1/ with no leading slash, as it is signed. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () =>
        (await this.http.get<T>(`/${path}`, { params, headers: this.headers('GET', path, '') }))
          .data,
    )
  }

  /** The body is serialised once, so the bytes sent are the bytes signed. */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const json = body === undefined ? '' : JSON.stringify(body)
    return withRetry(
      async () =>
        (await this.http.post<T>(`/${path}`, json, { headers: this.headers('POST', path, json) }))
          .data,
    )
  }
}
