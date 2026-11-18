import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Thin HTTP client for the Pickware / Shopware 5 REST API.
 *
 * Base URL:   {shopUrl}/api
 * Auth:       Authorization: Basic base64(username:api_key)
 *             credentials.accessToken already holds the base64 value.
 * Pagination: ?start=<offset>&limit=<n>
 */
export class PickwareClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const shopUrl = String(credentials.extra?.['shopUrl'] ?? '').replace(/\/+$/, '')
    if (!shopUrl) throw new Error('pickware requires credentials.extra.shopUrl')
    this.http = axios.create({
      baseURL: `${shopUrl}/api`,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
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

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
