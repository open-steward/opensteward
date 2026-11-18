/**
 * Yoti Sign (eSignatures) REST API client.
 *
 * `Authorization: Bearer <API_KEY>` header auth + JSON. The base URL is
 * resolved per-credential from the customer-selected environment stored on
 * `credentials.extra.environment`. Retries 429 + 5xx with exponential
 * backoff.
 *
 * Yoti Sign has no general list/pagination surface for envelopes — reads are
 * by-id (`GET /v2/envelopes/<id>`), and the only lookup endpoint
 * (`POST /v2/organisations/envelopes/find`) takes an explicit id list — so
 * there are no page/cursor query params to thread through.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { apiRoot } from './constants'

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

export class YotiSignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: apiRoot(credentials.extra?.['environment']),
      headers: {
        Authorization: `Bearer ${credentials.accessToken ?? ''}`,
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

  async patch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
