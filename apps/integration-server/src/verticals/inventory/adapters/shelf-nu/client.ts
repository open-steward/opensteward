/**
 * Shelf.nu HTTP client.
 *
 * Auth: Authorization: Bearer <supabase-jwt>
 * Org scope: ?orgId=<organizationId> appended to every request.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

export class ShelfNuClient {
  private http: AxiosInstance
  readonly organizationId: string

  constructor(credentials: Credentials) {
    const organizationId = String(credentials.extra?.['organizationId'] ?? '')
    if (!organizationId) throw new Error('shelf-nu requires credentials.extra.organizationId')
    this.organizationId = organizationId
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Merge orgId into query params automatically. */
  private orgParams(params?: Record<string, unknown>): Record<string, unknown> {
    return { orgId: this.organizationId, ...params }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.orgParams(params) })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.orgParams(),
      })
      return data
    })
  }
}
