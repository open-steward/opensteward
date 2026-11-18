/**
 * DocuSeal REST API client.
 *
 * Static API-key auth via the `X-Auth-Token` header + JSON. List endpoints use
 * cursor pagination: `limit` (max 100) plus `after` / `before` id cursors. The
 * response envelope wraps rows in `{ data, pagination }`.
 *
 * Docs: https://www.docuseal.com/docs/api
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, AUTH_HEADER } from './constants'
import { resolveApiKey, resolveBaseUrl } from './auth'

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

/** Standard DocuSeal list-response envelope. */
export interface DocusealListResponse<T> {
  data?: T[]
  pagination?: { count?: number; next?: number | null; prev?: number | null }
}

export class DocusealClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: resolveBaseUrl(credentials, API_BASE_URL),
      headers: {
        [AUTH_HEADER]: resolveApiKey(credentials),
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

  async patch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
