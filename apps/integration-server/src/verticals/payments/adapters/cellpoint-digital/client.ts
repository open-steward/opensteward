/**
 * CellPoint Digital (Velocity / mPoint) HTTP client.
 *
 * The Velocity core API speaks XML over HTTP. Every request carries TWO
 * complementary credentials (see `auth.ts`):
 *
 *   1. Authorization: Basic {base64(apiUsername:apiPassword)}
 *
 *   2. x-cpm-sec-token: SHA-256_HEX( bodyWithoutWhitespace + salt )
 *      The request integrity token. The body string has all whitespace
 *      removed, the merchant salt is appended, and the lowercase SHA-256 hex
 *      digest of the result is the header value. For body-less GET requests
 *      the "body" is the empty string, so the token is SHA-256(salt).
 *
 * There are no list endpoints: Velocity is transaction-oriented (initialize →
 * authorize → capture → refund, addressed later by transaction id). The
 * adapter therefore only exposes single-resource reads + actions; list*
 * methods are intentionally absent (the router auto-returns 501).
 *
 * Docs: https://documentation.cellpointdigital.com/docs/api
 *       https://documentation.cellpointdigital.com/docs/getting-started
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { XML_CONTENT_TYPE } from './constants'
import { apiUsername, apiPassword, salt, baseUrl } from './auth'

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
 * Compute the `x-cpm-sec-token` for a request body. The body string is
 * stripped of all whitespace, the merchant salt is appended, and the
 * lowercase SHA-256 hex digest is returned. Exported so the test seam and the
 * webhook verifier can reuse the exact construction.
 */
export function computeSecToken(body: string, secret: string): string {
  const stripped = body.replace(/\s+/g, '')
  return createHash('sha256').update(stripped + secret, 'utf8').digest('hex')
}

export class CellpointDigitalClient {
  private http: AxiosInstance
  private basicAuth: string
  private secret: string

  constructor(credentials: Credentials) {
    this.secret = salt(credentials)
    this.basicAuth = Buffer.from(
      `${apiUsername(credentials)}:${apiPassword(credentials)}`,
      'utf8',
    ).toString('base64')
    this.http = axios.create({
      baseURL: baseUrl(credentials),
      headers: { Accept: XML_CONTENT_TYPE },
      timeout: 30_000,
      // Velocity returns XML text; keep the raw string so transforms can parse it.
      responseType: 'text',
      transformResponse: [(data) => data],
    })
  }

  private headers(body: string): Record<string, string> {
    return {
      Authorization: `Basic ${this.basicAuth}`,
      'x-cpm-sec-token': computeSecToken(body, this.secret),
      'Content-Type': XML_CONTENT_TYPE,
    }
  }

  /** GET an XML resource (e.g. get-transaction-status). Returns the raw XML body. */
  async get(path: string): Promise<string> {
    const headers = this.headers('')
    return withRetry(async () => {
      const { data } = await this.http.get<string>(path, { headers })
      return typeof data === 'string' ? data : String(data ?? '')
    })
  }

  /** POST an XML body (e.g. capture-payment, refund). Returns the raw XML body. */
  async post(path: string, xmlBody: string): Promise<string> {
    const headers = this.headers(xmlBody)
    return withRetry(async () => {
      const { data } = await this.http.post<string>(path, xmlBody, { headers })
      return typeof data === 'string' ? data : String(data ?? '')
    })
  }
}
