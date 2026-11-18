/**
 * Airwallex REST API client — thin axios wrapper.
 *
 * Auth is two-legged: the client-id + api-key pair is exchanged at the login
 * endpoint for a bearer **token** (valid ~30 min), then sent as
 * `Authorization: Bearer <token>` on every call. The token is minted lazily on
 * the first request and re-minted once it is within a minute of expiry, so a
 * single client instance can serve a whole batch without re-logging-in.
 *
 * Lists are page-numbered: `page_num` (0-indexed) + `page_size`, and the
 * response carries `{ items: T[], has_more: boolean }`. Bodies are JSON.
 *
 * Docs: https://www.airwallex.com/docs/api
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { LOGIN_PATH, PROD_BASE_URL } from './constants'

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

/** Airwallex list envelope: `{ items: [...], has_more }`. */
export interface AirwallexListResponse<T> {
  items?: T[]
  has_more?: boolean
  [k: string]: unknown
}

interface LoginResponse {
  token: string
  expires_at?: string
}

/** Re-mint the bearer token once we are within this margin of expiry. */
const EXPIRY_MARGIN_MS = 60_000

export class AirwallexClient {
  private http: AxiosInstance
  private clientId: string
  private apiKey: string
  private token?: string
  private tokenExpiresAt = 0

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const baseURL = typeof extra.baseUrl === 'string' ? extra.baseUrl : PROD_BASE_URL
    this.clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Mint (or reuse) a bearer token from the client-id + api-key pair. */
  private async authToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - EXPIRY_MARGIN_MS) {
      return this.token
    }
    const { data } = await this.http.post<LoginResponse>(LOGIN_PATH, undefined, {
      headers: {
        'x-client-id': this.clientId,
        'x-api-key': this.apiKey,
      },
    })
    this.token = data.token
    const parsed = data.expires_at ? Date.parse(data.expires_at) : NaN
    // Fall back to the documented 30-minute lifetime if expires_at is absent.
    this.tokenExpiresAt = Number.isNaN(parsed) ? Date.now() + 30 * 60_000 : parsed
    return this.token
  }

  private async authHeader(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.authToken()}` }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const headers = await this.authHeader()
      return (await this.http.get<T>(path, { params, headers })).data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const headers = await this.authHeader()
      return (await this.http.post<T>(path, body ?? {}, { headers })).data
    })
  }
}
