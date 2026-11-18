/**
 * Scalapay REST API client — thin axios wrapper.
 *
 * Auth: Bearer-token (`Authorization: Bearer <api-key>`). Request and response
 * bodies are JSON.
 *
 * Pagination: the reporting list endpoints (`/v1/reporting/...`) use
 * `page` (0-based) + `size` query params and return a JSON array of records;
 * there is no cursor or envelope. The transactional `/v2/...` endpoints are
 * single-resource and not paginated.
 *
 * Docs: https://developers.scalapay.com/reference/get_v1-reporting-orders
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ScalapayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseURL: string = API_BASE_URL) {
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
