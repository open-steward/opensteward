/**
 * Pagar.me API v5 REST client — thin axios wrapper.
 *
 * Auth is HTTP Basic with the secret key as the username and an empty
 * password (see `auth.ts`). Bodies and responses are JSON.
 *
 * Lists are page-based: `page` (1-indexed) + `size` query params. The
 * response is an envelope `{ data: T[], paging: { total, previous, next } }`.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { basicAuthHeader } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Pagar.me list endpoints return a uniform envelope:
 *
 *   { data: T[], paging: { total, previous, next } }
 *
 * where `paging.previous` / `paging.next` are page URLs (or null when there
 * is no adjacent page).
 */
export interface PagarmeListResponse<T> {
  data?: T[]
  paging?: {
    total?: number
    previous?: string | null
    next?: string | null
  }
}

export class PagarmeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: basicAuthHeader(credentials.accessToken ?? ''),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.patch<T>(path, body)).data)
  }

  async delete<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path, { data: body })).data)
  }
}
