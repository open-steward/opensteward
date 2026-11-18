/**
 * Stripe REST API client — thin axios wrapper.
 *
 * Stripe uses Bearer-token auth (`Authorization: Bearer <secret-key>`) and
 * form-encoded request bodies. Lists are paginated cursor-style with
 * `starting_after` / `has_more`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION } from './constants'

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

export interface StripeListResponse<T> {
  object: 'list'
  data: T[]
  has_more: boolean
  url: string
}

export class StripeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Stripe-Version': API_VERSION,
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

  async list<T>(path: string, params?: Record<string, unknown>): Promise<StripeListResponse<T>> {
    return this.get<StripeListResponse<T>>(path, params)
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const form = body ? toForm(body) : undefined
      const { data } = await this.http.post<T>(path, form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

/**
 * Stripe accepts form-encoded bodies with bracket notation for nested objects:
 *   metadata[orderId]=42, items[0][price]=price_X.
 */
export function toForm(body: Record<string, unknown>): string {
  const out = new URLSearchParams()
  const walk = (prefix: string, value: unknown): void => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v))
      return
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(`${prefix}[${k}]`, v)
      }
      return
    }
    out.append(prefix, String(value))
  }
  for (const [k, v] of Object.entries(body)) walk(k, v)
  return out.toString()
}
