/**
 * Asaas REST API client — thin axios wrapper.
 *
 * Auth: the API key is sent verbatim in the `access_token` header (no
 * `Bearer` prefix). Bodies are JSON. List endpoints share a uniform envelope:
 *
 *   { object: 'list', hasMore: boolean, totalCount: number,
 *     limit: number, offset: number, data: T[] }
 *
 * Pagination is offset-based via `offset` + `limit` (limit ≤ 100).
 *
 * Docs: https://docs.asaas.com/docs/authentication-2
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, USER_AGENT } from './constants'

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

/** Uniform Asaas list envelope returned by every paginated GET. */
export interface AsaasListResponse<T> {
  object?: string
  hasMore?: boolean
  totalCount?: number
  limit?: number
  offset?: number
  data?: T[]
}

export class AsaasClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        access_token: credentials.accessToken ?? '',
        'User-Agent': USER_AGENT,
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
