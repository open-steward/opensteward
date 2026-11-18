/**
 * Knowmax HTTP client.
 *
 * Per-tenant base URL: https://app.knowmax.ai/{clientName}
 * Auth header: Authorization: Bearer <token>
 *
 * Pagination: Knowmax uses page-number pagination with `page` and `per_page`
 * query parameters.  The response envelope typically looks like:
 *   { data: [...], meta: { total: N, page: N, per_page: N } }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

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

export class KnowmaxClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const clientName = String(credentials.extra?.['clientName'] ?? '')
    if (!clientName) throw new Error('chatbot-knowmax: credentials.extra.clientName is required')
    const baseURL = API_BASE_URL_TEMPLATE.replace('{clientName}', clientName)
    this.http = axios.create({
      baseURL,
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
