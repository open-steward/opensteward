import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'
import { readExtra } from './auth'

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
 * Build the `GCS v1HMAC` Authorization header.
 *
 * The string-to-sign concatenates, each terminated by a newline:
 *   1. HTTP method (uppercase)
 *   2. Content-Type   (only sent on requests that carry a body)
 *   3. Date           (RFC-1123)
 *   4. Canonicalised X-GCS-* headers, lower-cased `name:value`, sorted
 *   5. The resource path (incl. decoded query string)
 *
 * The HMAC-SHA256 of that string, keyed by the API secret, is base64-encoded
 * and emitted as `GCS v1HMAC:{apiKeyId}:{signature}`.
 *
 * Docs: https://docs.direct.worldline-solutions.com/en/integration/api-developer-guide/authentication
 */
function sign(args: {
  method: string
  contentType: string
  date: string
  resource: string
  apiKeyId: string
  apiSecret: string
}): string {
  const { method, contentType, date, resource, apiKeyId, apiSecret } = args
  // No X-GCS-* custom headers are sent, so that block is empty.
  const stringToSign = `${method.toUpperCase()}\n${contentType}\n${date}\n${resource}\n`
  const signature = createHmac('sha256', apiSecret).update(stringToSign, 'utf8').digest('base64')
  return `GCS v1HMAC:${apiKeyId}:${signature}`
}

export class WorldlineClient {
  private http: AxiosInstance
  private apiKeyId: string
  private apiSecret: string
  /** PSPID-scoped path prefix, e.g. `/v2/1234`. */
  readonly basePath: string

  constructor(credentials: Credentials) {
    const { apiSecret, merchantId, environment } = readExtra(credentials)
    this.apiKeyId = credentials.accessToken
    this.apiSecret = apiSecret
    this.basePath = `/v2/${merchantId}`
    this.http = axios.create({
      baseURL: environment === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  private headers(method: string, resource: string, withBody: boolean): Record<string, string> {
    const date = new Date().toUTCString() // RFC-1123, e.g. "Wed, 02 Mar 2022 11:15:51 GMT"
    const contentType = withBody ? 'application/json' : ''
    const authorization = sign({
      method,
      contentType,
      date,
      resource,
      apiKeyId: this.apiKeyId,
      apiSecret: this.apiSecret,
    })
    const out: Record<string, string> = { Authorization: authorization, Date: date }
    if (withBody) out['Content-Type'] = contentType
    return out
  }

  async get<T>(path: string): Promise<T> {
    const resource = `${this.basePath}${path}`
    return withRetry(async () => {
      const res = await this.http.get<T>(resource, {
        headers: this.headers('GET', resource, false),
      })
      return res.data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const resource = `${this.basePath}${path}`
    const serialised = body === undefined ? '' : JSON.stringify(body)
    return withRetry(async () => {
      const res = await this.http.post<T>(resource, serialised, {
        headers: this.headers('POST', resource, body !== undefined),
      })
      return res.data
    })
  }
}
