/**
 * pandago HTTP client.
 *
 * - Auth: Bearer token from OAuth2 client_credentials + JWT assertion.
 * - Base URL: country-specific, derived from credentials.extra.countryCode.
 *   APSE countries: https://pandago-api-apse.deliveryhero.io/{cc}/api/v1
 *   Pakistan (pk):  https://pandago-api-apso.deliveryhero.io/pk/api/v1
 *   Sandbox:        https://pandago-api-sandbox.deliveryhero.io/{cc}/api/v1
 * - Retry: exponential back-off on 429 and 5xx, up to 4 retries.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  PANDAGO_API_BASE_APSE,
  PANDAGO_API_BASE_APSO,
  PANDAGO_API_SANDBOX,
  PANDAGO_API_PATH,
  DEFAULT_COUNTRY_CODE,
  PANDAGO_COUNTRIES_APSO,
} from './constants'

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveBaseUrl(credentials: Credentials): string {
  const extra = credentials.extra ?? {}
  const countryCode = String(extra['countryCode'] ?? DEFAULT_COUNTRY_CODE).toLowerCase()
  const isSandbox = String(extra['sandbox'] ?? 'false') === 'true'

  if (isSandbox) {
    return `${PANDAGO_API_SANDBOX}/${countryCode}${PANDAGO_API_PATH}`
  }

  const isApso = (PANDAGO_COUNTRIES_APSO as readonly string[]).includes(countryCode)
  const apiBase = isApso ? PANDAGO_API_BASE_APSO : PANDAGO_API_BASE_APSE
  return `${apiBase}/${countryCode}${PANDAGO_API_PATH}`
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const isRetryable =
        status === 429 || (status !== undefined && status >= 500 && status < 600)
      if (isRetryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 500))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

// ── Client ─────────────────────────────────────────────────────────────────

export class PandagoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = resolveBaseUrl(credentials)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
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

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete<T = void>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { data: body })
      return data
    })
  }
}
