/**
 * Weekdone REST client.
 *
 * Authentication: OAuth 2.0 bearer token passed as the `token` query
 * parameter on every request (Weekdone API v1 convention).
 *
 * Base URL: https://api.weekdone.com/1/
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

export class WeekdoneClient {
  private http: AxiosInstance
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /** Merge access token as required `token` query param. */
  private params(extra?: Record<string, unknown>): Record<string, unknown> {
    return { token: this.token, ...extra }
  }

  async get<T>(path: string, queryParams?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.params(queryParams) })
      return data
    })
  }
}
