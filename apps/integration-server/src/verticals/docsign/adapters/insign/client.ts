/**
 * inSign REST API client.
 *
 * HTTP Basic auth + JSON. The session id travels in the JSON request body
 * (`{ sessionid }`) rather than the path, which is why the read helpers are
 * POSTs. The per-instance base URL is resolved from `credentials.extra.baseUrl`
 * (sandbox by default). Retries 429 + 5xx with exponential backoff.
 *
 * inSign has no list/collection endpoints — sessions are addressed one at a
 * time — so there is no pagination to thread through this client.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL } from './constants'

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

export class InsignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL)
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async post<T>(
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body ?? {}, {
        params,
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
