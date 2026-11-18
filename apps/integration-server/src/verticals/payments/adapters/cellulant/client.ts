/**
 * Cellulant (Tingg) Checkout-API client — thin axios wrapper.
 *
 * Every authenticated request carries two headers:
 *   - `Authorization: Bearer <jwt>` — the short-lived client-credentials token
 *   - `apikey: <static api key>`     — the merchant's static API key
 *
 * The JWT expires, so the client re-mints it (via the client-credentials
 * grant) when it is missing or has passed its `expiresAt`, then re-sends the
 * failed request once on a 401.
 *
 * Tingg's checkout-api is request/response per transaction — there are no
 * cursor- or page-based list endpoints — so this client exposes only `get`
 * and `post`.
 *
 * Docs: https://docs.tingg.africa/reference/authenticate-requests
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlFor } from './constants'
import { mintToken, readExtra } from './auth'

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

export class CellulantClient {
  private http: AxiosInstance
  private credentials: Credentials
  private readonly apiKey: string
  private readonly environment: 'sandbox' | 'production'

  constructor(credentials: Credentials) {
    this.credentials = credentials
    const extra = readExtra(credentials)
    this.apiKey = extra.apiKey
    this.environment = extra.environment
    this.http = axios.create({
      baseURL: baseUrlFor(this.environment),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Re-mint the JWT when it is absent or past its expiry. */
  private async ensureToken(): Promise<string> {
    const expired =
      !this.credentials.accessToken ||
      (this.credentials.expiresAt !== undefined &&
        new Date(this.credentials.expiresAt).getTime() <= Date.now())
    if (expired) {
      const extra = readExtra(this.credentials)
      this.credentials = await mintToken(
        extra.apiKey,
        extra.clientId,
        extra.clientSecret,
        extra.environment,
      )
    }
    return this.credentials.accessToken
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      apikey: this.apiKey,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const token = await this.ensureToken()
      try {
        const { data } = await this.http.get<T>(path, { params, headers: this.headers(token) })
        return data
      } catch (err) {
        const fresh = await this.retryOn401(err)
        const { data } = await this.http.get<T>(path, { params, headers: this.headers(fresh) })
        return data
      }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const token = await this.ensureToken()
      try {
        const { data } = await this.http.post<T>(path, body, { headers: this.headers(token) })
        return data
      } catch (err) {
        const fresh = await this.retryOn401(err)
        const { data } = await this.http.post<T>(path, body, { headers: this.headers(fresh) })
        return data
      }
    })
  }

  /** On a 401, re-mint the JWT and return the new token; otherwise rethrow. */
  private async retryOn401(err: unknown): Promise<string> {
    if ((err as AxiosError).response?.status !== 401) throw err
    const extra = readExtra(this.credentials)
    this.credentials = await mintToken(
      extra.apiKey,
      extra.clientId,
      extra.clientSecret,
      extra.environment,
    )
    return this.credentials.accessToken
  }
}
