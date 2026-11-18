import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { requireMid, requireUsername } from './auth'

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
 * The pagination object every v3 list response carries next to `data`:
 * `{ total, pages, currentPage, limit, hasNext, hasPrev }`
 * (https://docs.transfi.com/reference/list-orders.md,
 * https://docs.transfi.com/reference/list-individual-users.md).
 */
export interface TransfiPagination {
  total?: number
  pages?: number
  currentPage?: number
  limit?: number
  hasNext?: boolean
  hasPrev?: boolean
}

/**
 * Basic auth plus the `MID` header on every request. Both are checked before
 * the client exists, so a connection made under the old single-API-key form
 * fails without sending anything.
 */
export class TransfiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const username = requireUsername(credentials)
    const mid = requireMid(credentials)
    const basic = Buffer.from(`${username}:${credentials.accessToken}`).toString('base64')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${basic}`,
        MID: mid,
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
