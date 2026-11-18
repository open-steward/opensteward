/**
 * SignDesk (Melento) REST API client.
 *
 * Authentication: the Application ID + License Key are sent as the
 * `x-application-id` + `x-license-key` headers (never `Authorization:
 * Bearer`). The host is resolved from `credentials.extra.baseUrl`
 * (defaults to api.signdesk.in); resource paths nest under
 * `${baseUrl}/api/...`. JSON request/response bodies.
 *
 * Pagination: the list endpoint uses `page` (1-indexed) + `limit` query
 * params and returns the rows alongside a `total` count.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  API_PATH_PREFIX,
  APP_ID_HEADER,
  DEFAULT_BASE_URL,
  LICENSE_KEY_HEADER,
} from './constants'

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

export class SigndeskClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    const applicationId = String(credentials.extra?.['applicationId'] ?? '')
    const licenseKey = String(credentials.extra?.['licenseKey'] ?? credentials.accessToken ?? '')
    this.http = axios.create({
      baseURL: `${baseUrl}${API_PATH_PREFIX}`,
      headers: {
        [APP_ID_HEADER]: applicationId,
        [LICENSE_KEY_HEADER]: licenseKey,
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
