import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

/**
 * Which headers an endpoint takes, per the official collection
 * (https://documenter.getpostman.com/view/7907941/2s93JusNJt):
 *   - 'apiKey'  — `x-api-key` only (most endpoints);
 *   - 'jwt'     — `Authorization: Bearer {{token}}` only (Customer management);
 *   - 'both'    — both (Get list of payments).
 */
export type NowpaymentsAuth = 'apiKey' | 'jwt' | 'both'

export class NowpaymentsClient {
  private http: AxiosInstance
  private readonly apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  private headers(auth: NowpaymentsAuth, jwt?: string): Record<string, string> {
    const h: Record<string, string> = {}
    if (auth !== 'jwt') h['x-api-key'] = this.apiKey
    if (auth !== 'apiKey') {
      if (!jwt) throw new Error('NOWPayments: this endpoint needs a JWT')
      h.Authorization = `Bearer ${jwt}`
    }
    return h
  }

  /**
   * POST /v1/auth {"email","password"} → {"token": "..."}. The token
   * "expire[s] in 5 minutes", so one is fetched per list call.
   */
  async jwt(email: string, password: string): Promise<string> {
    const res = await withRetry(
      async () => (await this.http.post<{ token?: string }>('/auth', { email, password })).data,
    )
    if (typeof res?.token !== 'string' || !res.token) {
      throw new Error('NOWPayments: POST /v1/auth returned no token')
    }
    return res.token
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    auth: NowpaymentsAuth = 'apiKey',
    jwt?: string,
  ): Promise<T> {
    const headers = this.headers(auth, jwt)
    return withRetry(async () => (await this.http.get<T>(path, { params, headers })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const headers = this.headers('apiKey')
    return withRetry(async () => (await this.http.post<T>(path, body, { headers })).data)
  }

  async delete<T>(path: string): Promise<T> {
    const headers = this.headers('apiKey')
    return withRetry(async () => (await this.http.delete<T>(path, { headers })).data)
  }
}
