/**
 * StoreFeeder HTTP client.
 *
 * Authentication: OAuth 2.0 Resource Owner Password Credentials Grant.
 *   POST /Token  (application/x-www-form-urlencoded)
 *   grant_type=password&username={email}&password={password}&client_id={apiKey}
 *   → { access_token, token_type, expires_in }
 *   Subsequent requests: Authorization: Bearer {access_token}
 *
 * If credentials.accessToken is already a live Bearer token (from a prior exchange)
 * it is used directly.  Otherwise the client calls /Token on first request and
 * caches the result in-instance.
 *
 * Retry: exponential back-off on 429 and 5xx, up to 4 retries.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, TOKEN_PATH } from './constants'

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

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

export class StoreFeederClient {
  private http: AxiosInstance
  /** Cached Bearer token after successful /Token exchange. */
  private bearerToken: string | undefined
  private readonly rawCredentials: Credentials

  constructor(credentials: Credentials) {
    this.rawCredentials = credentials
    // If accessToken is already populated (e.g. from a refreshed credential), use it.
    this.bearerToken = credentials.accessToken || undefined
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * Fetch an OAuth Bearer token from POST /Token using the resource-owner
   * password credentials grant.
   */
  async fetchToken(): Promise<string> {
    const username = String(this.rawCredentials.extra?.['username'] ?? '')
    const password = String(this.rawCredentials.extra?.['password'] ?? '')
    const apiKey = String(this.rawCredentials.extra?.['apiKey'] ?? '')
    if (!username) throw new Error('store-feeder requires credentials.extra.username')
    if (!password) throw new Error('store-feeder requires credentials.extra.password')
    if (!apiKey) throw new Error('store-feeder requires credentials.extra.apiKey')

    const body = new URLSearchParams({
      grant_type: 'password',
      username,
      password,
      client_id: apiKey,
    }).toString()

    const { data } = await this.http.post<TokenResponse>(TOKEN_PATH, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    this.bearerToken = data.access_token
    return this.bearerToken
  }

  private async getToken(): Promise<string> {
    if (this.bearerToken) return this.bearerToken
    return this.fetchToken()
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const token = await this.getToken()
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const token = await this.getToken()
      const { data } = await this.http.post<T>(path, body, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      return data
    })
  }
}
