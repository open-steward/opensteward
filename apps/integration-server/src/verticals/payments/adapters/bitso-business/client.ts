/**
 * Bitso Business REST API client — thin axios wrapper with request-signing.
 *
 * Bitso signs every request: the `Authorization` header is
 * `Bitso <key>:<nonce>:<signature>` where
 *
 *   signature = HMAC_SHA256( apiSecret, nonce + HTTP_METHOD + requestPath + body )  (hex)
 *
 *   - `nonce`       — a strictly increasing integer; we use the current Unix
 *                     time in milliseconds.
 *   - `HTTP_METHOD` — upper-cased (`GET`, `POST`, …).
 *   - `requestPath` — the path *including* the query string, exactly as sent
 *                     (e.g. `/v3/fundings/?limit=100`).
 *   - `body`        — the raw JSON request body, or empty string for GET.
 *
 * The signed string is computed in an axios request interceptor so the path,
 * query, and body it hashes are byte-identical to what axios actually puts on
 * the wire. Responses are wrapped in a `{ success, payload }` envelope; lists
 * are cursor-paginated with `marker` + `limit`.
 *
 * Docs: https://docs.bitso.com/bitso-api/docs/create-signed-requests
 */

import { createHmac } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { PRODUCTION_BASE_URL } from './constants'

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

/** Standard envelope returned by every Bitso v3 endpoint. */
export interface BitsoEnvelope<T> {
  success?: boolean
  payload?: T
  error?: { code?: string; message?: string }
}

/**
 * Build the `Authorization` header value for a single request.
 *
 * Exported for unit testing the signing scheme without a live HTTP call.
 */
export function buildAuthorization(
  apiKey: string,
  apiSecret: string,
  method: string,
  requestPath: string,
  body: string,
  nonce: string = Date.now().toString(),
): string {
  const message = nonce + method.toUpperCase() + requestPath + body
  const signature = createHmac('sha256', apiSecret).update(message).digest('hex')
  return `Bitso ${apiKey}:${nonce}:${signature}`
}

/** Render the request path (with query string) that axios will send. */
function requestPathFor(config: InternalAxiosRequestConfig): string {
  const base = (config.baseURL ?? '') + (config.url ?? '')
  // Use a dummy origin so the URL parser keeps an absolute-or-relative path.
  const url = new URL(base, 'https://placeholder.invalid')
  const search = config.params
    ? new URLSearchParams(
        Object.entries(config.params as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : url.search.replace(/^\?/, '')
  return url.pathname + (search ? `?${search}` : '')
}

export class BitsoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrlOverride?: string) {
    const apiKey = credentials.accessToken ?? ''
    const apiSecret = String(credentials.extra?.['apiSecret'] ?? '')
    const baseURL =
      baseUrlOverride ?? String(credentials.extra?.['baseUrl'] ?? PRODUCTION_BASE_URL)

    this.http = axios.create({
      baseURL,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })

    this.http.interceptors.request.use((config) => {
      const method = (config.method ?? 'get').toUpperCase()
      const requestPath = requestPathFor(config)
      const body =
        config.data === undefined || config.data === null
          ? ''
          : typeof config.data === 'string'
            ? config.data
            : JSON.stringify(config.data)
      config.headers.set(
        'Authorization',
        buildAuthorization(apiKey, apiSecret, method, requestPath, body),
      )
      return config
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
