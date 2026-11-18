/**
 * SignatureAPI REST client.
 *
 * Auth: `X-API-Key: <apiKey>` (stored on `credentials.accessToken` by the
 * credential form). JSON in/out. List endpoints take `limit`; the response carries `{ data, links: { next,
 * previous } }` where `links.next` is an opaque absolute URL for the next
 * page (null on the last page).
 *
 * Docs: https://signatureapi.com/docs/api/pagination
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_KEY_HEADER } from './constants'

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

/** Cursor-paginated list envelope returned by collection endpoints. */
export interface SignatureapiList<T> {
  data?: T[]
  links?: { next?: string | null; previous?: string | null }
}

export class SignatureapiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        [API_KEY_HEADER]: credentials.accessToken ?? '',
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  /** GET an absolute URL (used to follow opaque `links.next` pagination URLs). */
  async getAbsolute<T>(url: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(url)
      return data
    })
  }
}
