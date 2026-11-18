/**
 * Walmart Marketplace REST API HTTP client.
 *
 * Auth uses the `WM_SEC.ACCESS_TOKEN` header (not Bearer).
 * Required headers on every request:
 *   - WM_SEC.ACCESS_TOKEN
 *   - WM_SVC.NAME
 *   - WM_QOS.CORRELATION_ID (unique per request)
 *
 * Retries follow exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, WM_SVC_NAME } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class WalmartClient {
  private http: AxiosInstance
  private accessToken: string

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'WalmartClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.accessToken = credentials.accessToken
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'WM_SVC.NAME': WM_SVC_NAME,
      },
      timeout: 30_000,
    })
  }

  private requestHeaders(): Record<string, string> {
    return {
      'WM_SEC.ACCESS_TOKEN': this.accessToken,
      'WM_QOS.CORRELATION_ID': crypto.randomUUID(),
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: this.requestHeaders(),
      })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: this.requestHeaders(),
      })
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: this.requestHeaders(),
      })
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params,
        headers: this.requestHeaders(),
      })
    })
  }
}
