/**
 * SysAid API HTTP client.
 *
 * Per-tenant base URL derived from credentials.extra.accountId.
 * Auth: Bearer token in the Authorization header.
 * Retry: exponential back-off on 429 and 5xx.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

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

export class SysaidClient {
  private http: AxiosInstance
  private accountId: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    this.accountId = extra['accountId'] ?? ''
    const baseURL = API_BASE_URL_TEMPLATE.replace('{account}', this.accountId)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'x-sysaid-accountid': this.accountId,
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
