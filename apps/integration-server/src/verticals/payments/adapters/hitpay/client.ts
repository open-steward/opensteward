import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, SANDBOX_API_BASE_URL, API_KEY_HEADER } from './constants'
import { resolveEnvironment } from './auth'

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
 * Thin HTTP wrapper over the HitPay REST API. The business API key rides in
 * the `X-BUSINESS-API-KEY` header. HitPay accepts both form-encoded and JSON
 * bodies; we send JSON. The base URL switches on the stored environment.
 */
export class HitpayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL =
      resolveEnvironment(credentials) === 'sandbox' ? SANDBOX_API_BASE_URL : API_BASE_URL
    this.http = axios.create({
      baseURL,
      headers: {
        [API_KEY_HEADER]: credentials.accessToken,
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
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
