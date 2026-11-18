/**
 * Mekari Sign eSignature REST API client.
 *
 * Authentication is Mekari's HMAC scheme: each request carries a `Date`
 * header (RFC 7231) and an `Authorization: hmac ...` header whose signature
 * is HMAC-SHA256(CLIENT_SECRET) over the signing string:
 *
 *   date: <Date header value>\nrequest-line: <METHOD> <full-path?query> HTTP/1.1
 *
 * The method is UPPERCASE and the path must be the FULL absolute path
 * including the gateway prefix (e.g. `/v2/esign/v1/documents`), NOT the
 * relative path that axios appends to the baseURL.
 *
 * POST/PUT/PATCH/DELETE requests must also include a
 * `Digest: SHA-256=<base64(SHA-256(body))>` header, and "digest" must appear
 * in the Authorization `headers` field.
 *
 * There is a 300s clock-skew tolerance.
 *
 * Lists are `page` + `limit` paginated. JSON in/out.
 *
 * Docs: https://developers.mekari.com/docs/kb/hmac-authentication
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHmac, createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, HMAC_ALGORITHM } from './constants'

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

/** Build the request-line component of the HMAC signing string. */
function requestLine(method: string, fullPathWithQuery: string): string {
  // Mekari requires UPPERCASE method and the full absolute path.
  return `request-line: ${method.toUpperCase()} ${fullPathWithQuery} HTTP/1.1`
}

/**
 * Serialize query params to a query string in a stable, encoded order.
 * Returns an empty string when there are no params.
 */
function serializeParams(params?: Record<string, unknown>): string {
  const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null)
  if (entries.length === 0) return ''
  const search = new URLSearchParams()
  for (const [k, v] of entries) search.append(k, String(v))
  return `?${search.toString()}`
}

/** Compute SHA-256 Digest header value for a request body. */
function bodyDigest(body: string): string {
  const hash = createHash('sha256').update(body).digest('base64')
  return `SHA-256=${hash}`
}

export class MekariSignClient {
  private http: AxiosInstance
  private clientId: string
  private clientSecret: string
  /** The path prefix extracted from the baseURL (e.g. `/v2/esign/v1`). */
  private basePath: string

  constructor(credentials: Credentials, baseUrl: string = API_BASE_URL) {
    this.clientId = String(credentials.extra?.['clientId'] ?? credentials.accessToken ?? '')
    this.clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
    // Extract the path portion of the base URL so we can fold it into the
    // HMAC signing string — Mekari signs the FULL absolute path.
    try {
      this.basePath = new URL(baseUrl).pathname.replace(/\/$/, '')
    } catch {
      this.basePath = ''
    }
    this.http = axios.create({
      baseURL: baseUrl,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * Compute the Mekari HMAC headers for a GET request.
   * Signed headers: date + request-line.
   */
  private signedGetHeaders(
    path: string,
    queryString: string,
  ): Record<string, string> {
    const date = new Date().toUTCString()
    const fullPath = `${this.basePath}${path.startsWith('/') ? path : `/${path}`}${queryString}`
    const signingString = `date: ${date}\n${requestLine('GET', fullPath)}`
    const signature = createHmac('sha256', this.clientSecret)
      .update(signingString)
      .digest('base64')
    const authorization =
      `hmac username="${this.clientId}", ` +
      `algorithm="${HMAC_ALGORITHM}", ` +
      `headers="date request-line", ` +
      `signature="${signature}"`
    return { Date: date, Authorization: authorization }
  }

  /**
   * Compute the Mekari HMAC headers for a POST/PUT/PATCH/DELETE request.
   * Signed headers: date + request-line + digest.
   */
  private signedBodyHeaders(
    method: string,
    path: string,
    bodyJson: string,
  ): Record<string, string> {
    const date = new Date().toUTCString()
    const fullPath = `${this.basePath}${path.startsWith('/') ? path : `/${path}`}`
    const digest = bodyDigest(bodyJson)
    const signingString = `date: ${date}\n${requestLine(method, fullPath)}\ndigest: ${digest}`
    const signature = createHmac('sha256', this.clientSecret)
      .update(signingString)
      .digest('base64')
    const authorization =
      `hmac username="${this.clientId}", ` +
      `algorithm="${HMAC_ALGORITHM}", ` +
      `headers="date request-line digest", ` +
      `signature="${signature}"`
    return { Date: date, Digest: digest, Authorization: authorization }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      // Serialize once and reuse for both the URL and the HMAC signing string.
      const queryString = serializeParams(params)
      const headers = this.signedGetHeaders(path, queryString)
      const url = queryString ? `${path}${queryString}` : path
      const { data } = await this.http.get<T>(url, { headers })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const bodyJson = JSON.stringify(body ?? {})
      const { data } = await this.http.post<T>(path, body, {
        headers: {
          'Content-Type': 'application/json',
          ...this.signedBodyHeaders('POST', path, bodyJson),
        },
      })
      return data
    })
  }
}
