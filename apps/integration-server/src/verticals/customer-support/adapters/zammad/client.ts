/**
 * Zammad API HTTP client.
 *
 * Auth: "Authorization: Token token={apiToken}"
 * Pagination: ?page={n}&per_page={size}
 *
 * Docs: https://docs.zammad.org/en/latest/api/intro.html
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE, DEFAULT_PAGE_SIZE } from './constants'

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

export class ZammadClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? '').replace(/\/+$/, '')
    if (!baseUrl) {
      throw new Error('zammad requires credentials.extra.baseUrl')
    }
    const baseURL = API_BASE_URL_TEMPLATE.replace('{baseUrl}', baseUrl)
    this.http = axios.create({
      baseURL,
      headers: {
        // Zammad token auth: "Token token=<value>"
        Authorization: `Token token=${credentials.accessToken}`,
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

  /**
   * Paginate a list endpoint, returning all items across pages up to the
   * requested limit. Zammad returns plain arrays (no envelope).
   */
  async getAll<T>(path: string, perPage = DEFAULT_PAGE_SIZE, maxItems?: number): Promise<T[]> {
    const results: T[] = []
    let page = 1
    while (true) {
      const batch = await this.get<T[]>(path, { page, per_page: perPage })
      if (!Array.isArray(batch) || batch.length === 0) break
      results.push(...batch)
      if (maxItems !== undefined && results.length >= maxItems) {
        return results.slice(0, maxItems)
      }
      if (batch.length < perPage) break
      page++
    }
    return results
  }
}
