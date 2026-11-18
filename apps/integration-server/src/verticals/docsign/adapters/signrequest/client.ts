/**
 * SignRequest REST API client.
 *
 * Static-token auth (`Authorization: Token <token>`) + JSON. The token is
 * stored on `credentials.accessToken`. List endpoints are DRF-paginated:
 * `{ count, next, previous, results }`, navigated with `page` + `limit`;
 * the adapter reads one page per caller page.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/** DRF list envelope shared by every SignRequest collection endpoint. */
export interface SignRequestList<T> {
  count?: number
  next?: string | null
  previous?: string | null
  results?: T[]
}

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

export class SignRequestClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const token = credentials.accessToken ?? ''
    // Team-scoped tokens may be issued under a team subdomain; honour an
    // explicit base override on credentials.extra when present.
    const baseURL = String(credentials.extra?.['baseUrl'] ?? API_BASE_URL)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Token ${token}`,
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
}
