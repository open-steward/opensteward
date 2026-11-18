/**
 * Evrotrust vendor REST API client.
 *
 * Every vendor endpoint is a POST that takes a JSON body. Authentication is
 * per-request: the `Authorization` header carries an HMAC-SHA256 signature
 * of the *exact* serialized request body, keyed by the SHA-256 hash of the
 * vendor API key, as a lowercase hex string. The body must be transmitted
 * byte-for-byte identically to what was signed, so we serialize once and
 * send that exact string.
 *
 * There is no list/pagination surface in the vendor API — resources are
 * addressed individually by `transactionID` (a single document) or
 * `threadID` (a signing operation / group). JSON + retry on 429/5xx.
 *
 * Docs: https://docs.evrotrust.com/reference/overview
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHash, createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL } from './constants'

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

/** HMAC-SHA256 of `body`, keyed by SHA-256(apiKey), lowercase hex. */
function signBody(apiKey: string, body: string): string {
  const hashedKey = createHash('sha256').update(apiKey, 'utf8').digest()
  return createHmac('sha256', hashedKey).update(body, 'utf8').digest('hex')
}

export class EvrotrustClient {
  private http: AxiosInstance
  private apiKey: string
  readonly vendorNumber: string

  constructor(credentials: Credentials) {
    const baseURL = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL)
    this.apiKey = credentials.accessToken ?? ''
    this.vendorNumber = String(credentials.extra?.['vendorNumber'] ?? '')
    this.http = axios.create({
      baseURL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /** POST a JSON body, signing the exact serialized payload. */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const serialized = JSON.stringify({ vendorNumber: this.vendorNumber, ...body })
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, serialized, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: signBody(this.apiKey, serialized),
        },
      })
      return data
    })
  }
}
