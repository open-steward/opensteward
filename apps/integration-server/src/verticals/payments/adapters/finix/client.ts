/**
 * Finix REST API client — thin axios wrapper.
 *
 * Auth is HTTP Basic: the access token holds a pre-encoded
 * `base64(username:password)` pair (see `auth.ts`). Every request carries a
 * pinned `Finix-Version` header.
 *
 * Lists are cursor-paginated under the pinned 2022-02-01 version: the
 * envelope is
 *   { _embedded: { <resource>: [...] }, page: { limit, next_cursor } }
 * and the next page is fetched with `after_cursor=<next_cursor>`. "When
 * `next_cursor` is `null`, there are no more results available."
 *
 * Docs: https://docs.finix.com/api/section/authentication
 * Paging: https://docs.finix.com/additional-resources/developers/authentication-and-api-basics/pagination.md
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, LIVE_BASE_URL, SANDBOX_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Generic Finix list envelope. `K` is the `_embedded` resource key. */
export interface FinixListResponse<T, K extends string> {
  _embedded?: Partial<Record<K, T[]>>
  page?: { offset?: number; limit?: number; count?: number; next_cursor?: string | null }
  _links?: { next?: { href?: string } | null }
}

export class FinixClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const live = (credentials.extra as { live?: boolean } | undefined)?.live === true
    this.http = axios.create({
      baseURL: live ? LIVE_BASE_URL : SANDBOX_BASE_URL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        'Finix-Version': API_VERSION,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  /**
   * One upstream page of a list: its rows and `page.next_cursor`, the
   * `after_cursor` that fetches the page after it (absent on the last page).
   */
  async listPage<T, K extends string>(
    path: string,
    key: K,
    params?: Record<string, unknown>,
  ): Promise<{ items: T[]; next?: string }> {
    const res = await this.get<FinixListResponse<T, K>>(path, params)
    const next = res.page?.next_cursor
    return {
      items: res._embedded?.[key] ?? [],
      next: typeof next === 'string' && next !== '' ? next : undefined,
    }
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
