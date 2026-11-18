import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { signedHeaders } from './auth'

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
 * Signed Stark Bank client (see auth.ts). Each attempt is signed afresh, so a
 * retry carries a current Access-Time.
 */
export class StarkBankClient {
  private http: AxiosInstance

  constructor(private readonly credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () =>
        (await this.http.get<T>(path, { params, headers: signedHeaders(this.credentials, '') }))
          .data,
    )
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    // The signature covers the exact JSON string sent, so send that string.
    const json = JSON.stringify(body ?? {})
    return withRetry(
      async () =>
        (await this.http.post<T>(path, json, { headers: signedHeaders(this.credentials, json) }))
          .data,
    )
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(
      async () =>
        (await this.http.delete<T>(path, { headers: signedHeaders(this.credentials, '') })).data,
    )
  }
}
