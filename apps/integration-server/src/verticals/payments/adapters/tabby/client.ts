/**
 * Tabby REST API client — thin axios wrapper.
 *
 * Auth is a static secret-key bearer token (`Authorization: Bearer <secret>`)
 * and request/response bodies are JSON. Lists (`GET /api/v2/payments`) page
 * offset-style with `limit` (max 20) + `offset` and answer
 * `{ payments, pagination: { limit, offset, total_count } }`.
 *
 * The base host depends on the region the merchant selected at connect time
 * and stashed on `credentials.extra.region` (AE/KW `.ai` vs. KSA `.sa`).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlFor } from './constants'
import type { TabbyCredentialExtra } from './auth'

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

export class TabbyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = credentials.extra as Partial<TabbyCredentialExtra> | undefined
    this.http = axios.create({
      baseURL: baseUrlFor(extra?.region),
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
