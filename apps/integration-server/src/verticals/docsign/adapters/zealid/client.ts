/**
 * ZealiD Data API ("Orpheus") client.
 *
 * Every request is signed per-request with an HMAC-SHA512
 * `Authorization: HMAC ...` header built from the integrator's
 * `client_id` / `client_secret` (stored on `credentials.extra`). The
 * per-user grant `access_token` selects which user's documents are
 * visible and is carried as the `access_token` query parameter.
 *
 * Retries 429 + 5xx with exponential backoff. There is no documented
 * limit / offset / cursor pagination on the documents list.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { signHmacAuthorization } from './auth'

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

export class ZealidClient {
  private http: AxiosInstance
  private clientId: string
  private clientSecret: string
  private accessToken: string

  constructor(credentials: Credentials) {
    this.clientId = String(credentials.extra?.['clientId'] ?? '')
    this.clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
    this.accessToken = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const authorization = signHmacAuthorization({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        method: 'GET',
        path,
      })
      const { data } = await this.http.get<T>(path, {
        params: { access_token: this.accessToken, ...(params ?? {}) },
        headers: { Authorization: authorization },
      })
      return data
    })
  }
}
