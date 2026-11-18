/**
 * Lumin Sign REST API client.
 *
 * Auth is header-based: every request carries `X-API-Key: <apiKey>`. There
 * is no Bearer token and no per-account base resolution — the base URL is
 * fixed (production) or swapped for the sandbox host when the customer
 * selected the sandbox environment on the Connect form
 * (`credentials.extra.environment === 'sandbox'`).
 *
 * Template listing is page-based (`page` + `limit`); the response carries
 * `page`, `limit`, and `total_count` alongside the `data` array.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, SANDBOX_API_BASE_URL } from './constants'

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

export class LuminSignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const sandbox = credentials.extra?.['environment'] === 'sandbox'
    this.http = axios.create({
      baseURL: sandbox ? SANDBOX_API_BASE_URL : API_BASE_URL,
      headers: {
        'X-API-Key': String(credentials.accessToken ?? ''),
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params, headers })
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

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
