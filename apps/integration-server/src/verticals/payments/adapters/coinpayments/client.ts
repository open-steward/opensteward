/**
 * CoinPayments v2 REST client — thin axios wrapper with HMAC request-signing.
 *
 * Every authenticated request carries three headers:
 *
 *   X-CoinPayments-Client     — the client ID (public integration identifier)
 *   X-CoinPayments-Timestamp  — current UTC time, ISO-8601 without the `Z` suffix
 *   X-CoinPayments-Signature  — Base64( HMAC_SHA256( clientSecret, canonical ) )
 *
 * where the canonical string concatenates, with NO separators:
 *
 *   canonical = BOM(U+FEFF) + HTTP_METHOD + fullUrl + clientId + timestamp + body
 *
 *   - HTTP_METHOD — upper-cased (`GET`, `POST`, …).
 *   - fullUrl     — the absolute request URL *including* the query string,
 *                   exactly as sent (e.g.
 *                   `https://a-api.coinpayments.net/api/v2/merchant/invoices?page=1&perPage=100`).
 *   - body        — the raw JSON request body, or empty string for GET.
 *
 * The signature is computed in an axios request interceptor so the URL, query,
 * and body it hashes are byte-identical to what axios actually puts on the wire.
 * Lists are offset-paginated with `page` + `perPage` and wrapped in an
 * `{ items, paged: { total, page, perPage } }` envelope.
 *
 * Docs: https://docs.coinpayments.net/api/auth/
 */

import { createHmac } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  API_BASE_URL,
  CLIENT_HEADER,
  SIGNATURE_BOM,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from './constants'

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

/** Offset-paginated list envelope returned by CoinPayments v2 list endpoints. */
export interface CoinpaymentsPaged<T> {
  items?: T[]
  paged?: { total?: number; page?: number; perPage?: number }
}

/** CoinPayments stamps timestamps as UTC ISO-8601 *without* the trailing `Z`. */
export function coinpaymentsTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '')
}

/**
 * Compute the Base64 `X-CoinPayments-Signature` value for a single request.
 *
 * Exported for unit-testing the signing scheme without a live HTTP call.
 */
export function buildSignature(
  clientSecret: string,
  method: string,
  url: string,
  clientId: string,
  timestamp: string,
  body: string,
): string {
  const canonical = SIGNATURE_BOM + method.toUpperCase() + url + clientId + timestamp + body
  return createHmac('sha256', clientSecret).update(canonical, 'utf8').digest('base64')
}

/** Render the absolute request URL (with query string) that axios will send. */
function fullUrlFor(config: InternalAxiosRequestConfig): string {
  const url = new URL((config.url ?? ''), config.baseURL ?? API_BASE_URL)
  if (config.params) {
    for (const [k, v] of Object.entries(config.params as Record<string, unknown>)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

export class CoinpaymentsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const clientId = credentials.accessToken ?? ''
    const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })

    this.http.interceptors.request.use((config) => {
      const method = (config.method ?? 'get').toUpperCase()
      const url = fullUrlFor(config)
      const body =
        config.data === undefined || config.data === null
          ? ''
          : typeof config.data === 'string'
            ? config.data
            : JSON.stringify(config.data)
      const timestamp = coinpaymentsTimestamp()
      config.headers.set(CLIENT_HEADER, clientId)
      config.headers.set(TIMESTAMP_HEADER, timestamp)
      config.headers.set(
        SIGNATURE_HEADER,
        buildSignature(clientSecret, method, url, clientId, timestamp, body),
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
