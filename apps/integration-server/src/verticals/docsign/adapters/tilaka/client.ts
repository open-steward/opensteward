/**
 * Tilaka Sign+ managed-API client.
 *
 * Auth: `Authorization: Bearer <access_token>` (the client-credentials token
 * obtained at credential exchange). JSON in/out. The signing API is
 * POST-driven — even status reads (`/plus-checksignstatus`) are POSTs whose
 * body carries the `request_id` — so the client only exposes `post`.
 *
 * The environment host is resolved from `credentials.extra.baseUrl` (set at
 * credential exchange), defaulting to the production host.
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

export class TilakaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? API_BASE_URL)
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body ?? {}, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
