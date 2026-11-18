/**
 * APEXX Global Atomic REST API client — thin axios wrapper.
 *
 * Auth: a static API key in the `x-apikey` header (no Bearer prefix). Bodies
 * are JSON. Reads hang off `/transactions` (`GET /transactions/{id}` and
 * `GET /transactions`); mutations live under verb-named paths
 * (`/payment/direct`, `/capture/{id}`, `/refund/{id}`, `/cancel/{type}/{id}`,
 * `/credit`).
 *
 * Pagination: the `GET /transactions` list endpoint accepts `limit` plus an
 * `offset` (or page cursor) — we expose `limit` and pass through any extra
 * params the caller supplies.
 *
 * Docs: https://support.apexx.global/support/solutions/articles/19000111097-apexx-api-reference
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ApexxClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl?: string) {
    this.http = axios.create({
      baseURL: baseUrl ?? API_BASE_URL,
      headers: {
        'x-apikey': credentials.accessToken ?? '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body ?? {})).data)
  }
}
