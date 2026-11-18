/**
 * Validated ID — VIDsigner REST API client.
 *
 * HTTP Basic auth + JSON. The pre-encoded Basic token is stored on
 * `credentials.accessToken` and the chosen environment base URL on
 * `credentials.extra.baseUrl`. All resource paths nest under
 * `${baseUrl}/${API_VERSION}/...`.
 *
 * The client exposes a plain `get`; no list endpoint is read (see
 * `listEnvelopes` in index.ts). Retries 429 + 5xx with
 * exponential backoff.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_BASE_URL } from './constants'

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

export class ValidatedIdClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL)
    this.http = axios.create({
      baseURL: `${baseUrl}/${API_VERSION}`,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
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
