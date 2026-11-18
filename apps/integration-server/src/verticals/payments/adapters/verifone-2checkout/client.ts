/**
 * 2Checkout (Verifone) REST 6.0 client — thin axios wrapper.
 *
 * Auth: every request carries a freshly-computed `X-Avangate-Authentication`
 * header (see {@link buildAuthHeader}). The hash is time-boxed, so it cannot be
 * cached across requests. Bodies and responses are JSON.
 *
 * Pagination: list endpoints accept `Page` (1-based) + `Limit` query params and
 * return `{ Items: [...], Pagination: { Page, Limit, Count } }`. Some single
 * endpoints return a bare array, so {@link list} tolerates both shapes.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, AUTH_ALGO, AUTH_HASH_ALGORITHM } from './constants'
import { extractSecrets } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Current UTC time in the `Y-m-d H:i:s` format 2Checkout signs over. */
export function formatAuthDate(now: Date = new Date()): string {
  return now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
}

/**
 * Compute the `X-Avangate-Authentication` header value.
 *
 * hash = HMAC-SHA256( LEN(code) + code + LEN(date) + date, secretKey ), where
 * LEN is the UTF-8 **byte** length of each component.
 */
export function buildAuthHeader(
  merchantCode: string,
  secretKey: string,
  date: string = formatAuthDate(),
): string {
  const codeLen = Buffer.byteLength(merchantCode, 'utf8')
  const dateLen = Buffer.byteLength(date, 'utf8')
  const message = `${codeLen}${merchantCode}${dateLen}${date}`
  const hash = createHmac(AUTH_HASH_ALGORITHM, secretKey).update(message, 'utf8').digest('hex')
  return `code="${merchantCode}" date="${date}" hash="${hash}" algo="${AUTH_ALGO}"`
}

/** Envelope returned by 2Checkout list endpoints. */
export interface Verifone2checkoutListResponse<T> {
  Items?: T[]
  Pagination?: { Page?: number; Limit?: number; Count?: number }
}

export class Verifone2checkoutClient {
  private http: AxiosInstance
  private merchantCode: string
  private secretKey: string

  constructor(credentials: Credentials) {
    const { merchantCode, secretKey } = extractSecrets(credentials)
    this.merchantCode = merchantCode
    this.secretKey = secretKey
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Per-request auth header — recomputed every call because it is time-boxed. */
  private authHeader(): string {
    return buildAuthHeader(this.merchantCode, this.secretKey)
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { 'X-Avangate-Authentication': this.authHeader() },
      })
      return data
    })
  }

  /** GET a list endpoint, normalising the `{ Items, Pagination }` envelope. */
  async list<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
    const data = await this.get<Verifone2checkoutListResponse<T> | T[]>(path, params)
    if (Array.isArray(data)) return data
    return data.Items ?? []
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'X-Avangate-Authentication': this.authHeader() },
      })
      return data
    })
  }
}
