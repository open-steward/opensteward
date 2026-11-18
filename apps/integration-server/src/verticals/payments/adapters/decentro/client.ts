import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { authHeaders, environmentOf } from './auth'
import { baseUrlFor } from './constants'

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
 * Thin HTTP client for the Decentro REST API.
 *
 * Decentro authenticates with flat header credentials (client_id /
 * client_secret / module_secret / provider_secret) — no bearer token — and the
 * base URL depends on the configured environment (staging vs production).
 *
 * The payment endpoints this adapter uses are single-resource (create a
 * collection, fetch one transaction by id, issue one refund), so there is no
 * cursor/offset pagination to thread.
 */
export class DecentroClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: baseUrlFor(environmentOf(credentials)),
      headers: {
        ...authHeaders(credentials),
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
