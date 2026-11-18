/**
 * SeaTable HTTP client.
 *
 * Handles:
 *   - Bearer token injection (Account-Token, API-Token or Base-Token)
 *   - Base URL selection (cloud vs self-hosted from credentials.extra.serverUrl)
 *   - Exponential back-off on 429 / 5xx
 *
 * Auth model:
 *   Account operations (/api/v2.1/workspaces/, /api/v2.1/user-admin-dtables/)
 *   need an Account-Token (security: AccountTokenAuth), sent by accountGet.
 *   Base-level calls (/api-gateway/api/v2/dtables/{uuid}/...) require a Base-Token
 *   obtained by exchanging the API Token via:
 *     GET /api/v2.1/dtable/app-access-token/
 *     Authorization: Bearer {API-Token}
 *   The Base-Token is a JWT valid for 3 days; we cache it per client instance.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CLOUD_BASE_URL, ACCOUNT_API_PATH } from './constants'

interface AppAccessTokenResponse {
  access_token?: string
  dtable_uuid?: string
  workspace_id?: number | string
  dtable_name?: string
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

export function resolveBaseUrl(credentials: Credentials): string {
  const serverUrl = credentials.extra?.['serverUrl']
  if (typeof serverUrl === 'string' && serverUrl.trim()) {
    return serverUrl.replace(/\/$/, '')
  }
  return CLOUD_BASE_URL
}

export class SeatableClient {
  private http: AxiosInstance
  private baseToken: string | null = null

  constructor(credentials: Credentials) {
    const baseURL = resolveBaseUrl(credentials)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Fetches and caches a Base-Token by exchanging the API Token.
   * The Base-Token is required for all gateway (row/table) calls.
   */
  private async getBaseToken(): Promise<string> {
    if (this.baseToken) return this.baseToken
    const resp = await withRetry(async () => {
      const { data } = await this.http.get<AppAccessTokenResponse>(
        `${ACCOUNT_API_PATH}/dtable/app-access-token/`,
      )
      return data
    })
    const token = resp.access_token
    if (!token) throw new Error('SeaTable: app-access-token response missing access_token')
    this.baseToken = token
    return token
  }

  /**
   * GET for account operations (/api/v2.1/workspaces/, /api/v2.1/user-admin-dtables/),
   * authenticated with the Account-Token: "Every account operation (user,
   * team admin or system admin) requires an Account-Token."
   * (https://api.seatable.com/reference/authentication). The caller checks
   * that the connection has one before calling.
   */
  async accountGet<T>(
    accountToken: string,
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: `Bearer ${accountToken}` },
      })
      return data
    })
  }

  /**
   * GET for base-level gateway endpoints (/api-gateway/api/v2/…).
   * Automatically obtains and injects the Base-Token before the request.
   */
  async gatewayGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const token = await this.getBaseToken()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
