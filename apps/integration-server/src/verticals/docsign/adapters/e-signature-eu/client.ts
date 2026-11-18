/**
 * e-Signature.eu REST API client.
 *
 * Auth is a per-request `x-api-key` header plus a `userid` query parameter
 * (the latter injected automatically on every call). Responses are wrapped
 * in `{ success: boolean, result?: T, error?: string }`; `unwrap` validates
 * `success` and returns `result`.
 *
 * The API rate-limits at 10 requests/minute, surfaced as HTTP 403 with an
 * "Rate limit exceeded" error body, so we retry that case (alongside 429 +
 * 5xx) with exponential backoff. Generic 403s (e.g. insufficient credits)
 * are not retried.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

export interface ESignatureEuEnvelopeResponse<T> {
  success: boolean
  result?: T
  error?: string
}

function isRateLimited(err: AxiosError): boolean {
  if (err.response?.status !== 403) return false
  const body = err.response.data as { error?: string } | undefined
  return typeof body?.error === 'string' && /rate limit/i.test(body.error)
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable =
        status === 429 ||
        (status !== undefined && status >= 500 && status < 600) ||
        isRateLimited(axiosErr)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ESignatureEuClient {
  private http: AxiosInstance
  private userId: string

  constructor(credentials: Credentials) {
    this.userId = String(credentials.extra?.['userId'] ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'x-api-key': credentials.accessToken,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Merge the mandatory `userid` query param into every request. */
  private params(extra?: Record<string, unknown>): Record<string, unknown> {
    return { userid: this.userId, ...(extra ?? {}) }
  }

  private unwrap<T>(body: ESignatureEuEnvelopeResponse<T>): T {
    if (!body.success) {
      throw new Error(body.error ?? 'e-Signature.eu request failed')
    }
    return body.result as T
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<ESignatureEuEnvelopeResponse<T>>(path, {
        params: this.params(params),
      })
      return this.unwrap(data)
    })
  }

  async patch<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<ESignatureEuEnvelopeResponse<T>>(
        path,
        undefined,
        { params: this.params(params) },
      )
      return this.unwrap(data)
    })
  }

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<ESignatureEuEnvelopeResponse<T>>(path, {
        params: this.params(params),
      })
      return this.unwrap(data)
    })
  }
}
