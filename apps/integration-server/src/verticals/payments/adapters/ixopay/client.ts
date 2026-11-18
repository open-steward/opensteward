/**
 * IXOPAY Gateway v3 JSON client — axios wrapper with per-request HMAC signing.
 *
 * IXOPAY v3 uses TWO authentication mechanisms on every request:
 *
 *   1. HTTP Basic Auth:
 *      Authorization: Basic {base64(apiUsername:apiPassword)}
 *
 *   2. HMAC-SHA512 signature in a separate header:
 *      X-Signature: {base64(HMAC-SHA512(message, key = sharedSecret))}
 *
 *   The signature message is exactly 5 newline-joined lines (no empty line):
 *   message   = HTTP_METHOD
 *             + '\n' + SHA512_HEX(body)   (lowercase hex of SHA-512 of the exact
 *                                          request body; '' body hashes to the
 *                                          SHA-512 of the empty string)
 *             + '\n' + CONTENT_TYPE       (exact Content-Type header value)
 *             + '\n' + DATE               (RFC-7231 Date header value)
 *             + '\n' + REQUEST_URI        (path including /api/v3 prefix)
 *
 *   Required headers per request:
 *     Authorization: Basic {base64(username:password)}
 *     X-Signature:   {base64-encoded HMAC-SHA512}
 *     Date:          {RFC-7231}
 *     Content-Type:  application/json; charset=utf-8
 *
 * The same HMAC construction verifies inbound callbacks (see `webhook.ts`).
 *
 * Docs: https://documentation.ixopay.com/docs/guides/production/additional-security
 *       https://gateway.ixopay.com/Schema/V3/OpenApiSpecification.yml
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHash, createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, JSON_CONTENT_TYPE } from './constants'
import { apiKey, apiUsername, apiPassword, sharedSecret } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Build the IXOPAY X-Signature message for one request. Exported so the
 * webhook verifier reuses the exact same construction.
 *
 * The message is exactly 5 newline-joined fields — no empty line for custom
 * headers (IXOPAY v3 does not use custom headers in the signed message):
 *   METHOD \n SHA512_HEX(body) \n CONTENT_TYPE \n DATE \n REQUEST_URI
 *
 * @param method      HTTP method, upper-case (e.g. 'POST', 'GET').
 * @param requestUri  Full request path including /api/v3 prefix (e.g.
 *                    '/api/v3/transaction/{apiKey}/debit').
 * @param body        The raw request/notification body bytes ('' for GET).
 * @param contentType The Content-Type header value.
 * @param date        The RFC-7231 Date header value.
 */
export function buildSignatureMessage(
  method: string,
  requestUri: string,
  body: string,
  contentType: string,
  date: string,
): string {
  const bodyHash = createHash('sha512').update(body, 'utf8').digest('hex')
  return [method.toUpperCase(), bodyHash, contentType, date, requestUri].join('\n')
}

/** Compute `base64( HMAC-SHA512( message, secret ) )`. */
export function signMessage(message: string, secret: string): string {
  return createHmac('sha512', secret).update(message, 'utf8').digest('base64')
}

/** Standard IXOPAY v3 transaction-result envelope. */
export interface IxopayResult {
  success?: boolean
  returnType?: string
  uuid?: string
  purchaseId?: string
  merchantTransactionId?: string
  redirectUrl?: string
  returnData?: Record<string, unknown>
  errors?: Array<{
    message?: string
    code?: number | string
    adapterMessage?: string
    adapterCode?: string
  }>
  [key: string]: unknown
}

export class IxopayClient {
  private http: AxiosInstance
  private _apiKey: string
  private sharedSecret: string
  private basicAuth: string

  constructor(credentials: Credentials) {
    this._apiKey = apiKey(credentials)
    this.sharedSecret = sharedSecret(credentials)
    // Pre-compute the Base64 Basic auth token from username:password.
    const username = apiUsername(credentials)
    const password = apiPassword(credentials)
    this.basicAuth = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /** Resolve the connector API key (used to build transaction paths in index). */
  get connectorApiKey(): string {
    return this._apiKey
  }

  /**
   * Build per-request auth headers.
   * - `Authorization: Basic {base64(username:password)}`
   * - `X-Signature: {base64(HMAC-SHA512(message, sharedSecret))}`
   * - `Date: {RFC-7231}`
   * - `Content-Type: application/json; charset=utf-8`
   *
   * `requestUri` must be the full path from the server root, e.g.
   * `/api/v3/transaction/{apiKey}/debit` (since the base URL already
   * includes `/api/v3` this is `baseURL.pathname + path`).
   */
  private sign(method: string, requestUri: string, body: string): Record<string, string> {
    const date = new Date().toUTCString()
    const message = buildSignatureMessage(method, requestUri, body, JSON_CONTENT_TYPE, date)
    const signature = signMessage(message, this.sharedSecret)
    return {
      Authorization: `Basic ${this.basicAuth}`,
      'X-Signature': signature,
      Date: date,
      'Content-Type': JSON_CONTENT_TYPE,
    }
  }

  /**
   * Compute the full request URI for signing. The IXOPAY signature is over the
   * complete path from the server root (e.g. `/api/v3/transaction/{key}/debit`),
   * but `path` is relative to the base URL which already includes `/api/v3`.
   * We therefore prepend `/api/v3` to the path for signature computation only.
   */
  private fullUri(path: string): string {
    const prefix = '/api/v3'
    return path.startsWith(prefix) ? path : `${prefix}${path}`
  }

  async get<T = IxopayResult>(path: string): Promise<T> {
    const headers = this.sign('GET', this.fullUri(path), '')
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { headers })
      return data
    })
  }

  async post<T = IxopayResult>(path: string, body?: Record<string, unknown>): Promise<T> {
    // Send the exact bytes we signed; axios would re-serialize an object, so
    // pass the pre-stringified JSON.
    const bodyString = body ? JSON.stringify(body) : ''
    const headers = this.sign('POST', this.fullUri(path), bodyString)
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, bodyString || undefined, { headers })
      return data
    })
  }
}
