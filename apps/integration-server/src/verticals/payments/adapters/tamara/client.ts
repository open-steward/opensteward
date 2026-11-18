/**
 * Tamara REST API client — thin axios wrapper.
 *
 * Auth: Bearer-token (`Authorization: Bearer <api-token>`). Request and
 * response bodies are JSON.
 *
 * Pagination: Tamara's merchant API has no list endpoints — orders and
 * payments are addressed individually by `order_id` (`GET /orders/{order_id}`,
 * `POST /payments/capture`, etc.), so there is no cursor or page parameter to
 * thread through here.
 *
 * Docs: https://docs.tamara.co/reference/tamara-api-reference-documentation
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
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

export class TamaraClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseURL: string = API_BASE_URL) {
    this.http = axios.create({
      baseURL,
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
