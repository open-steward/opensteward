/**
 * Swell Backend API client.
 *
 *  - Host https://api.swell.store, HTTP Basic storeId:secretKey (see
 *    constants.ts for the doc quotes).
 *  - Retries with exponential backoff on 429 and 5xx.
 *
 * Paging is done by the adapter, which reads the documented list envelope
 * (https://developers.swell.is/backend-api/querying): "Paginated responses
 * include count (total matching records), results, page, limit, page_count,
 * and a pages map with the start and end record numbers of each page."
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** The documented list envelope (fields this adapter reads). */
export interface SwellListResponse<T> {
  results?: T[]
  count?: number
  page?: number
  limit?: number
  page_count?: number
  [key: string]: unknown
}

export class SwellClient {
  private http: AxiosInstance

  constructor(storeId: string, secretKey: string) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      auth: { username: storeId, password: secretKey },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, params ? { params } : undefined)
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
