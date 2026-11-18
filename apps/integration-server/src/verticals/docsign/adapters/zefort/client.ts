/**
 * Zefort REST API client.
 *
 * Auth is HTTP Basic with the API key as the username and an empty password:
 * `Authorization: Basic base64("<apiKey>:")`. The key lives verbatim on
 * `credentials.accessToken`; the per-instance base URL (sandbox / EU / US /
 * dedicated) is stored on `credentials.extra.baseUrl` and falls back to the
 * sandbox host.
 *
 * Lists paginate with `page` (1-indexed) + `page_size` and return a
 * `{ page, page_size, last_page, count, next, previous, results }` envelope.
 * A pinned `Zefort-Version` header keeps response shapes stable.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_API_BASE_URL, ZEFORT_API_VERSION } from './constants'

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

export class ZefortClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = String(credentials.extra?.['baseUrl'] ?? DEFAULT_API_BASE_URL)
    // API key is the Basic-auth username; the password is empty.
    const basic = Buffer.from(`${credentials.accessToken ?? ''}:`).toString('base64')
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
        'Zefort-Version': ZEFORT_API_VERSION,
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
