/**
 * Wekan REST API client.
 *
 * Authentication: Authorization: Bearer {token}
 * Base URL: per-installation serverUrl stored in credentials.extra.serverUrl
 * All paths are prefixed with /api (except the login path).
 *
 * Wekan returns full arrays — no cursor/page token pagination is documented.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PREFIX } from './constants'

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

export class WekanClient {
  private http: AxiosInstance
  readonly userId: string

  constructor(credentials: Credentials) {
    const serverUrl = String(credentials.extra?.['serverUrl'] ?? '').replace(/\/$/, '')
    this.userId = String(credentials.extra?.['userId'] ?? '')
    this.http = axios.create({
      baseURL: `${serverUrl}${API_PREFIX}`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
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
