/**
 * Network International (N-Genius Online) REST client — thin axios wrapper.
 *
 * Auth is two-legged: the Service Account API key (held on
 * `credentials.accessToken`) is POSTed as a Basic-auth secret to the identity
 * service for a short-lived (~5-minute) bearer access token, which is then
 * sent as `Authorization: Bearer <token>` on every payment call. The token is
 * minted lazily on the first request and re-minted once it is within a margin
 * of expiry, so one client instance serves a whole batch without re-auth.
 *
 * Every payment path is scoped to the merchant outlet reference
 * (`extra.outletRef`); `orderPath()` / `refundPath()` build those for callers.
 *
 * N-Genius is order-centric: there are no list endpoints — orders and their
 * embedded payments are fetched by reference — so there is no pagination.
 * Bodies and responses use the vendor media types in `constants.ts`.
 *
 * Docs: https://docs.ngenius-payments.com/reference/direct-api
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  ACCESS_TOKEN_PATH,
  IDENTITY_CONTENT_TYPE,
  PAYMENT_CONTENT_TYPE,
  PROD_BASE_URL,
  TOKEN_EXPIRY_MARGIN_MS,
  TOKEN_TTL_MS,
} from './constants'

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

interface AccessTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

export class NetworkInternationalClient {
  private http: AxiosInstance
  private apiKey: string
  private outletRef: string
  private token?: string
  private tokenExpiresAt = 0

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const baseURL = typeof extra.baseUrl === 'string' ? extra.baseUrl : PROD_BASE_URL
    this.outletRef = typeof extra.outletRef === 'string' ? extra.outletRef : ''
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL,
      timeout: 30_000,
    })
  }

  /** Merchant outlet reference these calls are scoped to. */
  get outlet(): string {
    return this.outletRef
  }

  /** POST `/transactions/outlets/{outletRef}/orders` (create order). */
  ordersPath(): string {
    return `/transactions/outlets/${this.outletRef}/orders`
  }

  /** GET `/transactions/outlets/{outletRef}/orders/{orderRef}` (fetch order). */
  orderPath(orderRef: string): string {
    return `/transactions/outlets/${this.outletRef}/orders/${orderRef}`
  }

  /**
   * POST the refund link on a capture:
   * `/transactions/outlets/{outletRef}/orders/{orderRef}/payments/{paymentRef}/captures/{captureRef}/refund`
   */
  refundPath(
    orderRef: string,
    paymentRef: string,
    captureRef: string,
  ): string {
    return (
      `/transactions/outlets/${this.outletRef}/orders/${orderRef}` +
      `/payments/${paymentRef}/captures/${captureRef}/refund`
    )
  }

  /** Mint (or reuse) a bearer access token from the Basic API key. */
  private async authToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS) {
      return this.token
    }
    const { data } = await this.http.post<AccessTokenResponse>(ACCESS_TOKEN_PATH, undefined, {
      headers: {
        Authorization: `Basic ${this.apiKey}`,
        'Content-Type': IDENTITY_CONTENT_TYPE,
        Accept: IDENTITY_CONTENT_TYPE,
      },
    })
    this.token = data.access_token
    const ttlMs = typeof data.expires_in === 'number' ? data.expires_in * 1000 : TOKEN_TTL_MS
    this.tokenExpiresAt = Date.now() + ttlMs
    return this.token
  }

  private async paymentHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.authToken()}`,
      'Content-Type': PAYMENT_CONTENT_TYPE,
      Accept: PAYMENT_CONTENT_TYPE,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const headers = await this.paymentHeaders()
      return (await this.http.get<T>(path, { params, headers })).data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const headers = await this.paymentHeaders()
      return (await this.http.post<T>(path, body ?? {}, { headers })).data
    })
  }
}
