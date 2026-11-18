/**
 * DocHub HTTP client.
 *
 * Bearer auth (`security: - bearerAuth: []` on the Public API V2
 * operations) with `Accept: application/json`, which selects the flat
 * response format. Callers on the documented V2 API pass V2_API_BASE_URL;
 * without it the client falls back to the unverified v1 placeholder host,
 * still used by listEnvelopes / getEnvelope / listTemplates / getTemplate.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, SANDBOX_API_BASE_URL } from './constants'

/**
 * Retries 429 always, and 5xx only when `retryServerErrors` is set. A 5xx
 * can arrive after the server committed the request, so a non-idempotent
 * POST must not be re-sent on one.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retryServerErrors = true,
  retries = 4,
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 ||
          (retryServerErrors && status !== undefined && status >= 500 && status < 600)) &&
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

export class DochubClient {
  private http: AxiosInstance

  /**
   * `baseURL` overrides the placeholder host. Everything rebuilt onto DocHub's
   * documented Public API V2 passes `V2_API_BASE_URL`; the rest still run on
   * the unverified placeholder below.
   */
  constructor(credentials: Credentials, baseURLOverride?: string) {
    const baseURL =
      baseURLOverride ?? (credentials.extra?.['sandbox'] ? SANDBOX_API_BASE_URL : API_BASE_URL)
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

  /** `opts.idempotent: false` stops a 5xx from re-sending the POST. */
  async post<T>(
    path: string,
    body?: Record<string, unknown>,
    opts: { idempotent?: boolean } = {},
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    }, opts.idempotent !== false)
  }

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path)
      return data
    })
  }
}
