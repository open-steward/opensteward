import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlFor } from './constants'
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
 * BlueSnap JSON Payment API client.
 *
 * Auth is HTTP Basic: `accessToken` already holds base64(`username:password`),
 * so we prefix `Basic `. The host (sandbox vs. production) is resolved from
 * `credentials.extra.environment`. Paging of the recurring list endpoints
 * (id keyset via `after` + `pagesize`) lives in the adapter, not here.
 */
export class BluesnapClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: baseUrlFor(environmentOf(credentials)),
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
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

  async put<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.put<T>(path, body, { params })).data)
  }
}
