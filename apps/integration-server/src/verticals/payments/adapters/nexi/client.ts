/**
 * Nexi Checkout (Nets Easy) Payment API v1 client — thin axios wrapper.
 *
 * Auth: secret key passed verbatim in the `Authorization` header (no scheme).
 * Bodies and responses are JSON. The Payment API v1 exposes resource-scoped
 * reads/writes (`/v1/payments/{id}`, `/v1/charges/{id}`, …) rather than
 * paginated collection endpoints, so there is no list helper here.
 *
 * Docs: https://developer.nexigroup.com/nexi-checkout/en-EU/api/payment-v1/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class NexiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl: string = API_BASE_URL) {
    this.http = axios.create({
      baseURL: `${baseUrl}/${API_VERSION}`,
      headers: {
        Authorization: credentials.accessToken ?? '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body ?? {})).data)
  }
}
