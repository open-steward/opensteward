/**
 * ComsignTrust WeSign REST API client.
 *
 * Auth, from https://wse.comsigntrust.com/api/swagger/v3/swagger.json:
 *   "securitySchemes": { "Bearer": { "type": "apiKey", "description": "JWT
 *   Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
 *   "name": "Authorization", "in": "header" } }
 * Retries 429 + 5xx with exponential backoff.
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
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ComsigntrustClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  /** A GET that also returns the response headers (WeSign reports list totals in `x-total-count`). */
  async getWithHeaders<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<{ data: T; headers: Record<string, unknown> }> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      return { data: res.data, headers: res.headers as Record<string, unknown> }
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

  async tryGet<T>(path: string, params?: Record<string, unknown>): Promise<T | undefined> {
    try {
      return await this.get<T>(path, params)
    } catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 404) return undefined
      throw err
    }
  }
}
