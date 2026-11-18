/**
 * Hyperswitch REST API client — thin axios wrapper.
 *
 * Auth: secret key in the `api-key` header. Bodies are JSON. List endpoints
 * paginate differently per resource: payments use cursor pagination
 * (`limit` + `starting_after`/`ending_before`) and return `{ size, data }`;
 * refunds use offset pagination (`limit` + `offset`) and return
 * `{ count, total_count, data }`; customers return a bare array.
 *
 * Docs: https://api-reference.hyperswitch.io/introduction
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

/** Cursor-paginated list envelope (payments). */
export interface HyperswitchCursorList<T> {
  size?: number
  data?: T[]
}

/** Offset-paginated list envelope (refunds). */
export interface HyperswitchOffsetList<T> {
  count?: number
  total_count?: number
  data?: T[]
}

export class HyperswitchClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl?: string) {
    this.http = axios.create({
      baseURL: baseUrl ?? API_BASE_URL,
      headers: {
        'api-key': credentials.accessToken ?? '',
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

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
