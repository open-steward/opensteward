import axios, { type AxiosInstance } from 'axios'
import { SAMEDAY_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

interface SamedayTokenResponse {
  token: string
  expire_at: string
}

/**
 * HTTP client for the Sameday Courier REST API.
 *
 * Authentication:
 *   Sameday uses a JWT session token. The client authenticates via
 *   POST /api/authenticate (with X-Auth-Username / X-Auth-Password headers)
 *   and a URL-encoded body of `remember_me=true`. The returned token is sent
 *   as the `X-AUTH-TOKEN` header on every subsequent request.
 *
 * Content-Type:
 *   All Sameday POST endpoints (AWB creation, cost estimation, etc.) require
 *   `application/x-www-form-urlencoded` — NOT `application/json`.
 *   The PHP SDK exclusively uses `RequestBodyUrlEncoded` for all requests.
 *
 * Credentials encoding:
 *   `credentials.refreshToken` holds `username:password` (set during
 *   exchangeCredentials). `credentials.accessToken` holds the current JWT;
 *   an empty or expired token triggers re-authentication.
 */

/**
 * Recursively serialize a plain object to URL-encoded form data.
 * Nested objects/arrays are encoded using PHP-style bracket notation
 * (e.g. `awbRecipient[name]=...`, `parcels[0][weight]=...`) which is what
 * the Sameday API expects when receiving `application/x-www-form-urlencoded`.
 */
function toUrlEncoded(obj: unknown, prefix?: string): string {
  if (obj === null || obj === undefined) return ''
  if (typeof obj !== 'object') {
    const key = prefix ? encodeURIComponent(prefix) : ''
    return key ? `${key}=${encodeURIComponent(String(obj))}` : ''
  }
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined || v === null) continue
    const fullKey = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = toUrlEncoded(v, fullKey)
      if (nested) parts.push(nested)
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const nested = toUrlEncoded(item, `${fullKey}[${i}]`)
        if (nested) parts.push(nested)
      })
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(v))}`)
    }
  }
  return parts.join('&')
}

export class SamedayClient {
  private http: AxiosInstance
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: SAMEDAY_API_BASE,
      headers: {
        // Sameday requires application/x-www-form-urlencoded for all POST bodies.
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    })
  }

  /**
   * Authenticate and store the JWT token. Called lazily when the token is
   * empty. Credentials are stored as `username:password` in `refreshToken`.
   *
   * Auth endpoint: POST /api/authenticate
   *   Headers: X-Auth-Username, X-Auth-Password
   *   Body: remember_me=true (application/x-www-form-urlencoded)
   *   Response: { token: string, expire_at: string }
   */
  private async authenticate(rawCredentials: string): Promise<void> {
    const colonIdx = rawCredentials.indexOf(':')
    if (colonIdx === -1) {
      throw new Error('Sameday credentials must be encoded as "username:password"')
    }
    const username = rawCredentials.slice(0, colonIdx)
    const password = rawCredentials.slice(colonIdx + 1)

    const { data } = await this.http.post<SamedayTokenResponse>(
      '/api/authenticate',
      'remember_me=true',
      {
        headers: {
          'X-Auth-Username': username,
          'X-Auth-Password': password,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    )
    this.token = data.token
  }

  /**
   * Ensure a valid token is present, authenticating if needed.
   */
  private async ensureToken(credentials: Credentials): Promise<void> {
    if (!this.token && credentials.refreshToken) {
      await this.authenticate(credentials.refreshToken)
    }
  }

  async get<T>(
    path: string,
    credentials: Credentials,
    params?: Record<string, unknown>,
  ): Promise<T> {
    await this.ensureToken(credentials)
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { 'X-AUTH-TOKEN': this.token },
      })
      return data
    })
  }

  /**
   * POST a request with an `application/x-www-form-urlencoded` body.
   * All Sameday data endpoints (AWB creation, cost estimation, etc.) require
   * URL-encoded form data — NOT JSON.
   */
  async post<T>(
    path: string,
    credentials: Credentials,
    body: unknown,
  ): Promise<T> {
    await this.ensureToken(credentials)
    return withRetry(async () => {
      const encoded = typeof body === 'string' ? body : toUrlEncoded(body)
      const { data } = await this.http.post<T>(path, encoded, {
        headers: {
          'X-AUTH-TOKEN': this.token,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
      return data
    })
  }

  async delete(path: string, credentials: Credentials): Promise<void> {
    await this.ensureToken(credentials)
    return withRetry(async () => {
      await this.http.delete(path, {
        headers: { 'X-AUTH-TOKEN': this.token },
      })
    })
  }
}
