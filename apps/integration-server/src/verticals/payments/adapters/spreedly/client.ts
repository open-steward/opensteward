/**
 * Spreedly Core API v1 client — thin axios wrapper.
 *
 * Auth is HTTP basic: the environment key is the username, the access secret
 * the password. The environment key lives on `credentials.accessToken`; the
 * access secret on `credentials.extra.accessSecret`.
 *
 * Lists are token-cursor paginated: pass the token of the last record in the
 * current page as `since_token` to fetch the next page. `order` flips
 * ascending (default) ↔ descending, and `count` (max 100) bounds the page.
 *
 * Docs: https://docs.spreedly.com/reference/api/v1/order_pagination/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
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

export class SpreedlyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const environmentKey = credentials.accessToken
    const accessSecret = String(
      (credentials.extra as Record<string, unknown> | undefined)?.accessSecret ?? '',
    )
    this.http = axios.create({
      baseURL: API_BASE_URL,
      auth: { username: environmentKey, password: accessSecret },
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
