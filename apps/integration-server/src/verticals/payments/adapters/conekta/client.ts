import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION_ACCEPT } from './constants'

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
 * Conekta list endpoints (`/orders`, `/customers`, an order's nested
 * `charges`) return a uniform envelope:
 *
 *   { object: 'list', has_more: boolean,
 *     next_page_url: string | null, previous_page_url: string | null,
 *     data: T[] }
 *
 * Pagination is cursor-style via `next`/`previous` query params keyed on an
 * object id, with `limit` (1–250) controlling page size.
 */
export interface ConektaListResponse<T> {
  object?: string
  has_more?: boolean
  next_page_url?: string | null
  previous_page_url?: string | null
  data?: T[]
}

export class ConektaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: API_VERSION_ACCEPT,
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

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
