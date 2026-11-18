/**
 * Deskpro API v2 HTTP client.
 *
 * Auth: Authorization: key <apiKey>
 * The per-customer instance URL is taken from credentials.extra.instanceUrl.
 *
 * Pagination: Deskpro uses  ?page=N&count=N  query parameters and returns
 * pagination metadata in response.meta.pagination  (total, page, per_page,
 * total_pages).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH } from './constants'

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

export class DeskproClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const instanceUrl = String(credentials.extra?.['instanceUrl'] ?? '').replace(/\/$/, '')
    if (!instanceUrl) {
      throw new Error('Deskpro requires credentials.extra.instanceUrl')
    }
    const baseURL = `${instanceUrl}${API_PATH}`
    this.http = axios.create({
      baseURL,
      headers: {
        // Deskpro API key format: "key <id>:<secret>"
        Authorization: `key ${credentials.accessToken}`,
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
