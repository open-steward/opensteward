import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { DISPATCHTRACK_API_BASE_TEMPLATE, RATE_LIMIT_RPS } from './constants'
import type { Credentials } from '../../adapter/interface'

// Simple token-bucket rate limiter (shared across all instances)
let _tokens = RATE_LIMIT_RPS
let _lastRefill = Date.now()

function consumeToken(): Promise<void> {
  const now = Date.now()
  const elapsed = (now - _lastRefill) / 1000
  _tokens = Math.min(RATE_LIMIT_RPS, _tokens + elapsed * RATE_LIMIT_RPS)
  _lastRefill = now
  if (_tokens >= 1) {
    _tokens -= 1
    return Promise.resolve()
  }
  const wait = ((1 - _tokens) / RATE_LIMIT_RPS) * 1000
  _tokens = 0
  return new Promise((r) => setTimeout(r, wait))
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      await consumeToken()
      return await fn()
    } catch (err) {
      const ae = err as AxiosError
      if (ae.response?.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Build the per-account API base URL.
 *
 * DispatchTrack uses subdomains of the form:
 *   https://<accountCode>.dispatchtrack.com/api/external/v1/
 *
 * The accountCode is stored in `credentials.extra.accountCode`.
 */
function buildBaseUrl(credentials: Credentials): string {
  const code = String(credentials.extra?.['accountCode'] ?? 'app')
  return DISPATCHTRACK_API_BASE_TEMPLATE.replace('{accountCode}', code)
}

/**
 * DispatchTrack HTTP client.
 *
 * Authentication: `api_key` query-string parameter on every request.
 * Base URL: account-specific subdomain derived from credentials.extra.accountCode.
 */
export class DispatchTrackClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: buildBaseUrl(credentials),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { api_key: this.apiKey, ...params },
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { api_key: this.apiKey },
      })
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        params: { api_key: this.apiKey },
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params: { api_key: this.apiKey },
      })
    })
  }
}
