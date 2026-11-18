import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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
 * Thin HTTP client for the SkuNexus REST API.
 *
 * SkuNexus follows Rails JSON conventions:
 *   - All field names are snake_case
 *   - Pagination: ?page=N&per_page=N  (1-indexed)
 *   - List responses: { data: T[], meta: { total_count, current_page, total_pages } }
 *   - Single-item responses: { data: T }
 *   - Auth header: X-API-Key: <key>
 */
export class SkuNexusClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Allow tenant-specific base URLs via credentials.extra.baseUrl
    const baseURL = String(credentials.extra?.['baseUrl'] ?? API_BASE_URL)
    this.http = axios.create({
      baseURL,
      headers: {
        'X-API-Key': credentials.accessToken,
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
