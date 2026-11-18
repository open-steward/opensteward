/**
 * Primer REST API client — thin axios wrapper.
 *
 * Auth is a single API key sent on every request as the `X-Api-Key` header
 * (no bearer-token exchange). Requests are pinned to a wire version with the
 * `X-Api-Version` header. The environment host is carried on
 * `credentials.extra.baseUrl`, resolved at credential-exchange time.
 *
 * List endpoints paginate with an opaque `cursor` + `limit` and return
 * `{ data: T[], nextCursor, prevCursor }`. Bodies are JSON.
 *
 * Docs: https://primer.io/docs/api-reference/get-started/authentication
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, PROD_BASE_URL } from './constants'

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

/** Primer cursor-paginated list envelope: `{ data, nextCursor, prevCursor }`. */
export interface PrimerListResponse<T> {
  data?: T[]
  nextCursor?: string | null
  prevCursor?: string | null
  [k: string]: unknown
}

export class PrimerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const baseURL = typeof extra.baseUrl === 'string' ? extra.baseUrl : PROD_BASE_URL
    this.http = axios.create({
      baseURL,
      headers: {
        'X-Api-Key': credentials.accessToken,
        'X-Api-Version': API_VERSION,
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
    return withRetry(async () => (await this.http.post<T>(path, body ?? {})).data)
  }
}
