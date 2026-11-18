/**
 * Haptik HTTP client.
 *
 * Auth headers per request:
 *   Authorization: Bearer <apiToken>
 *   client-id: <clientId>
 *
 * The base URL is tenant-specific and stored in credentials.extra.baseUrl.
 * Falls back to the staging URL when not set.
 *
 * Pagination: Haptik uses cursor/offset pagination where supported. The
 * `limit` and `page` query params are used where the API accepts them.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { STAGING_BASE_URL } from './constants'

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

export class HaptikClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = String(credentials.extra?.['baseUrl'] ?? STAGING_BASE_URL).replace(/\/$/, '')
    const clientId = String(credentials.extra?.['clientId'] ?? '')
    if (!clientId) {
      throw new Error('haptik requires credentials.extra.clientId')
    }
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'client-id': clientId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
