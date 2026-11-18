/**
 * Buy Me a Coffee API v1 HTTP client.
 *
 * Key characteristics:
 *
 *  - Auth: `Authorization: Bearer <accessToken>` header.
 *  - Responses: `{ data: [...], current_page, last_page, per_page, total }`.
 *  - Pagination: `?page=N` query parameter (1-indexed).
 *  - Retries on 429 and 5xx with exponential back-off (max 4 retries).
 *
 * Docs: https://developers.buymeacoffee.com/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/** Shared paginated list envelope returned by all BMAC list endpoints. */
export interface BmacListEnvelope<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable =
        status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class BmacClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'BmacClient: credentials.accessToken is required — supply the ' +
          'Buy Me a Coffee personal access token from Settings → API.',
      )
    }
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a paginated list endpoint and return the full envelope.
   */
  async getList<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<BmacListEnvelope<T>> {
    return withRetry(async () => {
      const { data } = await this.http.get<BmacListEnvelope<T>>(path, {
        params,
      })
      return data
    })
  }

  /**
   * GET a paginated list endpoint and return only the `data` array.
   */
  async listItems<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const envelope = await this.getList<T>(path, params)
    return envelope.data ?? []
  }
}
