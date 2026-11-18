/**
 * Datapel WMS HTTP client.
 *
 * Auth flow (Breeze DataServer):
 *   1. GET /token — Authorization: Basic <base64(user:pass)>
 *      Response: { "AuthToken": "<token>", "APIPath": "<baseUrl>", ... }
 *   2. All subsequent requests:
 *      Authorization: Basic <base64(user:pass)>
 *      AuthToken:     <session_token>
 *
 * Pagination: query params `page` (1-based) and `pagesize`.
 * JSON responses are typically a root object with a named list key, e.g.
 *   { "inventorylist": [...] }  or  { "items": [...] }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_DEFAULT, TOKEN_TTL_MS } from './constants'

interface TokenResponse {
  AuthToken?: string
  APIPath?: string
  [key: string]: unknown
}

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

export class DatapelClient {
  private http: AxiosInstance
  private authCode: string
  private serverUrl: string
  private authToken: string | null = null
  private tokenExpiresAt = 0

  constructor(credentials: Credentials) {
    this.authCode = credentials.accessToken
    const extra = credentials.extra ?? {}
    this.serverUrl = String(extra['serverUrl'] ?? '').replace(/\/+$/, '') || API_BASE_URL_DEFAULT
    this.http = axios.create({
      baseURL: this.serverUrl,
      timeout: 30_000,
      headers: { Accept: 'application/json' },
    })
  }

  /** Fetch (or return cached) session token. */
  private async getToken(): Promise<string> {
    const now = Date.now()
    if (this.authToken && now < this.tokenExpiresAt) return this.authToken
    const res = await withRetry(async () => {
      const { data } = await this.http.get<TokenResponse>('/token', {
        headers: { Authorization: `Basic ${this.authCode}` },
      })
      return data
    })
    const token =
      res.AuthToken ??
      (res['authtoken'] as string | undefined) ??
      (res['token'] as string | undefined)
    if (!token) throw new Error('datapel: /token response did not include AuthToken')
    // If the server returns a different API path, honour it.
    const apiPath = res.APIPath ?? (res['apipath'] as string | undefined)
    if (apiPath) {
      const normalised = String(apiPath).replace(/\/+$/, '')
      if (normalised && normalised !== this.serverUrl) {
        this.serverUrl = normalised
        this.http.defaults.baseURL = normalised
      }
    }
    this.authToken = token
    this.tokenExpiresAt = now + TOKEN_TTL_MS
    return token
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Basic ${this.authCode}`,
      AuthToken: await this.getToken(),
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const headers = await this.authHeaders()
      const { data } = await this.http.get<T>(path, { params, headers })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const headers = await this.authHeaders()
      const { data } = await this.http.post<T>(path, body, {
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
