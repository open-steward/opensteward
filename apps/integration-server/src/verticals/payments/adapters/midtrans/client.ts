import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { resolveBaseUrl } from './constants'
import { environmentOf } from './auth'

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
 * Midtrans Core API client.
 *
 * Auth is HTTP Basic with the Server Key as the username and an empty
 * password: `Authorization: Basic base64("<ServerKey>:")`. We let axios build
 * that header from the `auth` option (username = Server Key, password = '').
 *
 * The Core API has **no list endpoints** — every resource is fetched by a
 * single id (`order_id`/`transaction_id`) — so there is no pagination to
 * carry. The client exposes only single-resource `get`/`post`.
 *
 * Docs: https://docs.midtrans.com/docs/api-authorization-headers
 */
export class MidtransClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: resolveBaseUrl(environmentOf(credentials)),
      auth: { username: credentials.accessToken, password: '' },
      headers: {
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
