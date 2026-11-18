/**
 * Computop Paygate REST API client — thin axios wrapper.
 *
 * Auth is HTTP Basic: `credentials.accessToken` already holds the
 * Base64-encoded `MerchantID:APIKey` token, so we send it verbatim behind the
 * `Basic` scheme. Bodies are JSON. Collections are page-paginated via a 1-based
 * `?page=` query parameter and return a `{ totalNumberOfPages, page, pageSize,
 * data[] }` envelope.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
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

/** Page envelope returned by Computop `GET` collection endpoints. */
export interface ComputopPage<T> {
  totalNumberOfPages?: number
  totalNumberOfItems?: number
  page?: number
  pageSize?: number
  data?: T[]
}

export class ComputopClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseURL: string = API_BASE_URL) {
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.patch<T>(path, body)).data)
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
