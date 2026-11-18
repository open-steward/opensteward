/**
 * Manhattan Active WM — HTTP client.
 *
 * Wraps axios with:
 *  - Bearer token injection
 *  - Exponential back-off on 429 / 5xx
 *  - Typed get/post helpers
 *
 * The base URL is built at runtime from the environment identifier stored in
 * credentials.extra.environment.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { apiBaseUrl } from './constants'

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

export class ManhattanActiveClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const env = String(credentials.extra?.['environment'] ?? '')
    if (!env) throw new Error('manhattan-active: credentials.extra.environment is required')

    this.http = axios.create({
      baseURL: apiBaseUrl(env),
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
