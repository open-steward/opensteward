/**
 * HaloPSA HTTP client.
 *
 * - Auth: Bearer token (access_token from OAuth2 client_credentials grant).
 * - Base URL: tenant-specific, stored in credentials.extra.tenantUrl + '/api'.
 * - Pagination: page_no (1-indexed) + page_size; response envelope has record_count.
 * - Retry: exponential back-off on 429 and 5xx up to 4 retries.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH } from './constants'

function resolveBaseUrl(credentials: Credentials): string {
  const tenantUrl = String((credentials.extra ?? {})['tenantUrl'] ?? '').replace(/\/+$/, '')
  if (!tenantUrl) throw new Error('HaloPSA: credentials.extra.tenantUrl is required')
  return `${tenantUrl}${API_PATH}`
}

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

export class HaloPsaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = resolveBaseUrl(credentials)
    this.http = axios.create({
      baseURL,
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
