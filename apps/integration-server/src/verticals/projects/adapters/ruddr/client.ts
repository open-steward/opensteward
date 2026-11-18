/**
 * Thin HTTP client for the Ruddr REST API.
 *
 * Authentication: Bearer token via `Authorization: Bearer <api_key>`.
 * Base URL:       https://www.ruddr.io/api/workspace
 * Pagination:     cursor-based via `startingAfter` / `endingBefore` query
 *                 params; response envelope: `{ results: T[], hasMore: boolean }`.
 * Rate limits:    429 triggers exponential back-off (up to 4 retries).
 *
 * Docs: https://docs.ruddr.io/guides/conventions
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class RuddrClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = (credentials.accessToken ?? '').trim()
    if (!token) {
      throw new Error('Ruddr connection is missing the API key.')
    }
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
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
}
