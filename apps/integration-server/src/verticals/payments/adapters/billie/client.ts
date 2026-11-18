/**
 * Billie REST API client — thin axios wrapper.
 *
 * Billie uses Bearer-token auth (`Authorization: Bearer <jwt>`) with
 * JSON request/response bodies. Resource endpoints are addressed by UUID
 * (`GET /orders/{uuid}`, `GET /invoices/{captureId}`) — Billie exposes no
 * cursor- or page-based list endpoints, so this client has no pagination
 * helper. The host (sandbox vs production) is selected from
 * `credentials.extra.environment`.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, SANDBOX_API_BASE_URL } from './constants'

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

function baseUrlFor(credentials: Credentials): string {
  const env = credentials.extra?.environment
  return env === 'sandbox' ? SANDBOX_API_BASE_URL : API_BASE_URL
}

export class BillieClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: baseUrlFor(credentials),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
