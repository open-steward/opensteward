/**
 * Descartes Sellercloud REST API client.
 *
 * - Auto-obtains and caches a JWT Bearer token from /api/token.
 * - Re-authenticates transparently when the token nears expiry (55-min window).
 * - Retries on 429 and 5xx with exponential back-off.
 *
 * Base URL is team-specific: https://{teamSubdomain}.api.sellercloud.com/rest
 * Docs: https://developer.sellercloud.com/dev-article/authentication/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl, TOKEN_TTL_MS } from './constants'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

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

export class SellercloudClient {
  private http: AxiosInstance
  private baseUrl: string
  private username: string
  private password: string

  /** Cached bearer token */
  private bearerToken = ''
  /** Timestamp (ms) when the current token was issued */
  private tokenIssuedAt = 0

  constructor(credentials: Credentials) {
    const extra = credentials.extra ?? {}
    const teamSubdomain = String(extra['teamSubdomain'] ?? '')
    this.username = String(extra['username'] ?? '')
    this.password = String(extra['password'] ?? '')

    if (!teamSubdomain) {
      throw new Error('sellercloud requires credentials.extra.teamSubdomain')
    }
    if (!this.username || !this.password) {
      throw new Error('sellercloud requires credentials.extra.username and credentials.extra.password')
    }

    this.baseUrl = buildBaseUrl(teamSubdomain)

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    })

    // If a live token was pre-populated (e.g. by a previous refresh), honour it.
    if (credentials.accessToken) {
      this.bearerToken = credentials.accessToken
      this.tokenIssuedAt = Date.now()
    }
  }

  private tokenExpired(): boolean {
    if (!this.bearerToken) return true
    return Date.now() - this.tokenIssuedAt >= TOKEN_TTL_MS
  }

  private async authenticate(): Promise<void> {
    const { data } = await this.http.post<TokenResponse>('/api/token', {
      Username: this.username,
      Password: this.password,
    })
    this.bearerToken = data.access_token
    this.tokenIssuedAt = Date.now()
  }

  private async authHeader(): Promise<Record<string, string>> {
    if (this.tokenExpired()) {
      await this.authenticate()
    }
    return { Authorization: `Bearer ${this.bearerToken}` }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const headers = await this.authHeader()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params, headers })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const headers = await this.authHeader()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, { headers })
      return data
    })
  }
}
