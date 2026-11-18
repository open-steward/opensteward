/**
 * Orderbot API client.
 *
 * Auth flow:
 *   1. GET /accesstoken with HTTP Basic (email:password) → { token: string }
 *   2. Cache the bearer token for TOKEN_TTL_MS; re-fetch on expiry.
 *   3. All data calls use Authorization: Bearer <token>.
 *
 * Pagination: query param `page` (1-based integer).
 * Total pages available in response header `x-total-pages`.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, TOKEN_TTL_MS } from './constants'

interface TokenCache {
  token: string
  expiresAt: number
}

// Module-level cache keyed by md5-style composite. A simple Map is fine for
// the integration server's single-process model.
const tokenCache = new Map<string, TokenCache>()

function cacheKey(email: string, password: string): string {
  return `orderbot:${email}:${password}`
}

async function fetchBearerToken(email: string, password: string): Promise<string> {
  const http = axios.create({ baseURL: API_BASE_URL, timeout: 15_000 })
  const { data } = await http.get<{ token: string }>('/accesstoken', {
    auth: { username: email, password },
    headers: { Accept: 'application/json' },
  })
  if (!data?.token) throw new Error('orderbot /accesstoken response missing token field')
  return data.token
}

async function getToken(email: string, password: string): Promise<string> {
  const key = cacheKey(email, password)
  const cached = tokenCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.token
  const token = await fetchBearerToken(email, password)
  tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS })
  return token
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

export class OrderbotClient {
  private email: string
  private password: string

  constructor(credentials: Credentials) {
    this.email = String(credentials.extra?.['email'] ?? '')
    this.password = String(credentials.extra?.['password'] ?? '')
    if (!this.email || !this.password) {
      throw new Error('orderbot requires credentials.extra.email and credentials.extra.password')
    }
  }

  private async http(): Promise<AxiosInstance> {
    const token = await getToken(this.email, this.password)
    return axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET endpoint with optional query params.
   * Returns { data, totalPages } so callers can paginate.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<{ data: T; totalPages: number }> {
    return withRetry(async () => {
      const http = await this.http()
      const res = await http.get<T>(path, { params })
      const totalPages = parseInt(String(res.headers['x-total-pages'] ?? '1'), 10) || 1
      return { data: res.data, totalPages }
    })
  }

  /**
   * POST endpoint.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const http = await this.http()
      const { data } = await http.post<T>(path, body ?? {})
      return data
    })
  }
}
