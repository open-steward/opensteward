import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlForEnvironment } from './constants'
import { environmentOf } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * CoinGate list endpoints (`/orders`, `/refunds`, `/ledger/transactions`)
 * return a page-numbered envelope:
 *
 *   { current_page, per_page, total_pages, total_orders|total_refunds,
 *     orders|refunds: T[] }
 *
 * The collection key differs per resource, so the adapter passes the key it
 * expects and we read it off generically. Pagination is page-based:
 * `page` (1-based) + `per_page` (1–100).
 */
export interface CoingatePage<T> {
  current_page?: number
  per_page?: number
  total_pages?: number
  [key: string]: unknown | T[]
}

export class CoingateClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: baseUrlForEnvironment(environmentOf(credentials)),
      headers: {
        Authorization: `Token ${credentials.accessToken}`,
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

/** Pull the array under `key` from a CoinGate page envelope, defensively. */
export function pageItems<T>(envelope: CoingatePage<T> | undefined, key: string): T[] {
  const arr = envelope?.[key]
  return Array.isArray(arr) ? (arr as T[]) : []
}
