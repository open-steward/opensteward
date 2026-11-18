/**
 * Epos Now API client.
 *
 * Features:
 *  - Bearer token (OAuth2) or Basic auth (API key) on every request.
 *  - Base URL: `https://api.eposnowhq.com/api/v4/`.
 *  - Page-based pagination via `?page=N` query parameter.
 *  - 429/5xx retry with exponential backoff.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status != null && status >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class EposNowClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    // Support both OAuth2 (accessToken) and API key (extra.apiKey) auth
    if (credentials.accessToken) {
      headers['Authorization'] = `Bearer ${credentials.accessToken}`
    } else {
      const apiKey = credentials.extra?.['apiKey'] as string | undefined
      const apiSecret = credentials.extra?.['apiSecret'] as string | undefined
      if (apiKey && apiSecret) {
        const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
        headers['Authorization'] = `Basic ${encoded}`
      } else {
        throw new Error(
          'Epos Now adapter requires either an accessToken (OAuth2) or ' +
            'apiKey + apiSecret in credentials.extra',
        )
      }
    }

    this.http = axios.create({
      baseURL: BASE_URL,
      headers,
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * `size` rows from 0-based row `offset` of a V4 list endpoint.
   *
   * V4 lists take only `page` — "Supports pagination via page parameter. 200
   * response items per page." and "Not providing page will return items for
   * page 1." — with no page size, so a caller's page is sliced out of the
   * fixed 200-row upstream page(s) holding it: at most two, as `size` ≤ 200.
   *
   * `hasMore` only when the fetched rows prove it: rows past the window mean
   * more; a short upstream page ending inside the window is the end. A window
   * ending exactly on a full upstream page is undecided (`undefined`).
   */
  async listWindow<T>(
    path: string,
    window: { offset: number; size: number },
  ): Promise<{ items: T[]; hasMore?: boolean }> {
    const skip = window.offset % MAX_PAGE_SIZE
    const end = skip + window.size
    const rows: T[] = []
    let short = false
    for (let page = Math.floor(window.offset / MAX_PAGE_SIZE) + 1; rows.length < end; page++) {
      const res = await this.get<T[]>(path, { page })
      const items = Array.isArray(res) ? res : []
      rows.push(...items)
      if (items.length < MAX_PAGE_SIZE) {
        short = true
        break
      }
    }
    const hasMore = rows.length > end ? true : short ? false : undefined
    return { items: rows.slice(skip, end), hasMore }
  }
}
