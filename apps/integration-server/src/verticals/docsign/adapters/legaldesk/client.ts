/**
 * LegalDesk eSign REST API client.
 *
 * Authentication: a per-account API key sent as the `x-api-key` header on
 * every request (never `Authorization: Bearer`). The host (production vs
 * sandbox) is resolved from `credentials.extra.baseUrl`; resource paths nest
 * under `${baseUrl}/${API_VERSION}/...`. JSON request/response bodies.
 *
 * Pagination: the transaction-list endpoint uses `page` (1-indexed) +
 * `limit` query params and returns the rows alongside a `total` count.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_KEY_HEADER, API_VERSION, DEFAULT_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
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

export class LegaldeskClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    const apiKey = String(credentials.extra?.['apiKey'] ?? credentials.accessToken ?? '')
    this.http = axios.create({
      baseURL: `${baseUrl}/${API_VERSION}`,
      headers: {
        [API_KEY_HEADER]: apiKey,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
