/**
 * Extensiv Order Manager REST client.
 *
 * Base URL: https://api.skubana.com
 * Auth: Bearer {access_token}
 * Pagination: page (1-based) + limit
 * Rate limit: ~1 req/5 s; client applies exponential backoff on 429/5xx.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

const RATE_LIMIT_DELAY_MS = 5_100 // >5 s between calls as per Skubana rate-limit docs

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (status === 429 && i < retries) {
        const retryAfter = Number(axiosErr.response?.headers?.['retry-after'] ?? 0) * 1000
        await new Promise((r) => setTimeout(r, retryAfter || RATE_LIMIT_DELAY_MS * Math.pow(2, i)))
        continue
      }
      if (status !== undefined && status >= 500 && status < 600 && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1_000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ExtensivOrderManagerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
}
