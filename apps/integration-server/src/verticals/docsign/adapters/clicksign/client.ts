/**
 * Clicksign REST API client.
 *
 * Authentication: API key as the `access_token` query-string parameter on
 * every request. JSON body for POST/PUT.
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

export class ClicksignClient {
  private http: AxiosInstance
  private accessToken: string

  constructor(credentials: Credentials) {
    this.accessToken = String(credentials.accessToken ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  private mergeParams(params?: Record<string, unknown>): Record<string, unknown> {
    return { access_token: this.accessToken, ...(params ?? {}) }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.mergeParams(params) })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.mergeParams(),
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async patch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, {
        params: this.mergeParams(),
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params: this.mergeParams() })
      return data
    })
  }
}
