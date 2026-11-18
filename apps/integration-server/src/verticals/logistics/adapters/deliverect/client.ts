import axios, { type AxiosInstance } from 'axios'
import {
  DELIVERECT_API_BASE,
  DELIVERECT_API_BASE_STAGING,
  DELIVERECT_TOKEN_URL,
  DELIVERECT_TOKEN_URL_STAGING,
  DELIVERECT_AUDIENCE,
  DELIVERECT_AUDIENCE_STAGING,
  TOKEN_EXPIRY_BUFFER_MS,
  TOKEN_DEFAULT_TTL_MS,
} from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  expires_at?: number
  scope?: string
}

interface TokenCache {
  token: string
  expiresAt: number
}

export class DeliverectClient {
  private http: AxiosInstance
  private clientId: string
  private clientSecret: string
  readonly accountId: string
  private tokenCache: TokenCache | null = null
  private isStaging: boolean
  private tokenUrl: string
  private audience: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const clientId = extra.clientId as string | undefined
    const clientSecret = extra.clientSecret as string | undefined
    const accountId = (extra.accountId as string | undefined) ?? ''

    if (!clientId || !clientSecret) {
      throw new Error(
        'Deliverect client requires clientId and clientSecret in credentials.extra',
      )
    }

    this.clientId = clientId
    this.clientSecret = clientSecret
    this.accountId = accountId

    this.isStaging = process.env['NODE_ENV'] !== 'production'
    const baseURL = this.isStaging ? DELIVERECT_API_BASE_STAGING : DELIVERECT_API_BASE
    this.tokenUrl = this.isStaging ? DELIVERECT_TOKEN_URL_STAGING : DELIVERECT_TOKEN_URL
    this.audience = this.isStaging ? DELIVERECT_AUDIENCE_STAGING : DELIVERECT_AUDIENCE

    this.http = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private async fetchToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token
    }

    const resp = await axios.post<TokenResponse>(
      this.tokenUrl,
      {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        audience: this.audience,
        grant_type: 'client_credentials',
      },
      { headers: { 'Content-Type': 'application/json' } },
    )

    const { access_token, expires_in, expires_at } = resp.data

    let expiresAt: number
    if (expires_at) {
      // Unix timestamp in seconds
      expiresAt = expires_at * 1000 - TOKEN_EXPIRY_BUFFER_MS
    } else {
      const ttlMs = (expires_in ?? TOKEN_DEFAULT_TTL_MS / 1000) * 1000
      expiresAt = Date.now() + ttlMs - TOKEN_EXPIRY_BUFFER_MS
    }

    this.tokenCache = { token: access_token, expiresAt }
    return access_token
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const token = await this.fetchToken()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.fetchToken()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const token = await this.fetchToken()
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }

  async delete<T>(path: string): Promise<T> {
    const token = await this.fetchToken()
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }
}
