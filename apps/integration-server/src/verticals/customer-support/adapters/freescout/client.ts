/**
 * FreeScout HTTP client.
 *
 * Authentication: X-FreeScout-API-Key header.
 * Base URL: <instanceUrl>/api  (instanceUrl stored in credentials.extra).
 * Pagination: page + pageSize query params; response body has totalElements / totalPages.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH_PREFIX } from './constants'

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

export class FreescoutClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const instanceUrl = String(credentials.extra?.['instanceUrl'] ?? '').replace(/\/+$/, '')
    if (!instanceUrl) throw new Error('FreeScout: instanceUrl is required in credentials.extra')
    const baseURL = `${instanceUrl}${API_PATH_PREFIX}`
    this.http = axios.create({
      baseURL,
      headers: {
        'X-FreeScout-API-Key': credentials.accessToken,
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
