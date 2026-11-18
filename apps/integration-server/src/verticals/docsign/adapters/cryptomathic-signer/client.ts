/**
 * Cryptomathic Signer — Cloud Signature Consortium (CSC) API v2 client.
 *
 * The CSC API is JSON over HTTPS. All methods are invoked with HTTP POST and a
 * JSON request body (the `info` method accepts an empty body); the issued
 * service access token is sent as `Authorization: Bearer <token>` (RFC 6750).
 *
 * The per-customer RSSP base URL (prod vs evaluation) lives on
 * `credentials.extra.baseUrl`; resource paths nest under
 * `${baseUrl}/csc/v2/...`. Retries 429 + 5xx with exponential backoff.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CSC_API_BASE_PATH, DEFAULT_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class CryptomathicSignerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.http = axios.create({
      baseURL: `${baseUrl}${CSC_API_BASE_PATH}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Invoke a CSC method. All CSC API methods are HTTP POST + JSON body. */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body ?? {})
      return data
    })
  }
}
