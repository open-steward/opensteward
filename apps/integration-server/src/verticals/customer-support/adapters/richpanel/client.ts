import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

// Richpanel rate-limits to 100 req/min and returns 492 (custom) or 429 when exceeded.
const RATE_LIMIT_STATUSES = new Set([429, 492])

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryAfter = (axiosErr.response?.headers as Record<string, string> | undefined)?.['retry-after']
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.pow(2, i) * 1000
      if (status !== undefined && (RATE_LIMIT_STATUSES.has(status) || status >= 500) && i < retries) {
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class RichpanelClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'x-richpanel-key': credentials.accessToken,
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
