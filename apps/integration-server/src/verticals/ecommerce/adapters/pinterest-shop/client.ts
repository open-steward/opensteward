/**
 * Pinterest Catalogs API v5 HTTP client.
 *
 * Key characteristics:
 *
 *  - Auth: Bearer token in `Authorization` header.
 *  - Responses return data directly (no wrapping envelope).
 *  - List endpoints use cursor-based pagination via `bookmark` parameter.
 *  - Rate limits: 1000 requests/min for most endpoints.
 *  - Retries on 429 and 5xx with exponential backoff.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

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

export interface PinterestListResponse<T> {
  items: T[]
  bookmark?: string | null
}

export class PinterestClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'PinterestClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
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

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * Fetch a paginated list endpoint. Pinterest uses cursor-based pagination
   * with a `bookmark` token.
   */
  async list<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<PinterestListResponse<T>> {
    const queryParams = {
      page_size: DEFAULT_PAGE_SIZE,
      ...params,
    }
    const data = await this.get<PinterestListResponse<T>>(path, queryParams)
    return {
      items: data.items ?? [],
      bookmark: data.bookmark ?? null,
    }
  }
}
