/**
 * Brink Commerce REST API client.
 *
 * Features:
 *  - Bearer token + x-api-key authentication.
 *  - A base URL per service: each is a path prefix (`/product`, `/order`, …)
 *    on the merchant's one management host (see constants.ts).
 *  - Simple 429/5xx retry with exponential backoff.
 *
 * Brink documents no paging parameter on any Management or Order endpoint:
 * its collection reads return every row in one response (e.g.
 * `{"deliveries": [...]}`), so there is no list helper here. Callers slice
 * locally with `pageLocally`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

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
  // unreachable, but TypeScript needs it
  throw new Error('unreachable')
}

/**
 * Create an axios instance pre-configured for a Brink Commerce service.
 */
function createHttp(baseURL: string, credentials: Credentials): AxiosInstance {
  const apiKey = credentials.extra?.['apiKey'] as string | undefined
  if (!apiKey) {
    throw new Error(
      'BrinkCommerceClient: credentials.extra.apiKey is required (Merchant Portal → Settings → API Clients)',
    )
  }
  return axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
}

export class BrinkCommerceClient {
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
  }

  /** Service-scoped GET on the given absolute base URL + path. */
  async get<T>(baseUrl: string, path: string, params?: Record<string, unknown>): Promise<T> {
    const http = createHttp(baseUrl, this.credentials)
    return withRetry(async () => {
      const { data } = await http.get<T>(path, { params })
      return data
    })
  }

  /** Service-scoped PUT. */
  async put<T>(baseUrl: string, path: string, body?: unknown): Promise<T> {
    const http = createHttp(baseUrl, this.credentials)
    return withRetry(async () => {
      const { data } = await http.put<T>(path, body)
      return data
    })
  }

  /** Service-scoped PATCH. */
  async patch<T>(baseUrl: string, path: string, body?: unknown): Promise<T> {
    const http = createHttp(baseUrl, this.credentials)
    return withRetry(async () => {
      const { data } = await http.patch<T>(path, body)
      return data
    })
  }

  /** Service-scoped POST. */
  async post<T>(baseUrl: string, path: string, body?: unknown): Promise<T> {
    const http = createHttp(baseUrl, this.credentials)
    return withRetry(async () => {
      const { data } = await http.post<T>(path, body)
      return data
    })
  }

  /** Service-scoped DELETE. */
  async delete(baseUrl: string, path: string): Promise<void> {
    const http = createHttp(baseUrl, this.credentials)
    return withRetry(async () => {
      await http.delete(path)
    })
  }
}
