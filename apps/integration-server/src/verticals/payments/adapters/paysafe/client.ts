/**
 * Paysafe Payments API client — thin axios wrapper.
 *
 * Auth: HTTP Basic. The credential carries a pre-encoded token in
 * `accessToken`, sent as `Authorization: Basic <token>`. The environment host
 * is resolved at credential-exchange time and stored on `credentials.extra.baseUrl`.
 *
 * Bodies and responses are JSON. Lists paginate with `limit` (max 50) +
 * `offset` and wrap the records in a resource-named array alongside a `meta`
 * object (`PagingResultMeta`); the total is not returned.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL } from './constants'

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

/**
 * Paysafe list envelope. The records live under a resource-named key
 * (`payments`, `settlements`, `refunds`, `profiles`); `meta` carries the
 * paging position (`numberOfRecords`, `page`, `limit`, `offset`).
 */
export interface PaysafePagingMeta {
  numberOfRecords?: number
  page?: number
  numberOfPages?: number
  firstPage?: { offset: number }
  lastPage?: { offset: number }
}

export class PaysafeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = (credentials.extra?.baseUrl as string | undefined) ?? DEFAULT_BASE_URL
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
}

/** Clamp a caller-supplied page size to Paysafe's bounds. */
export function clampLimit(limit: number | undefined, max: number, fallback: number): number {
  const n = typeof limit === 'number' && limit > 0 ? limit : fallback
  return Math.min(n, max)
}
