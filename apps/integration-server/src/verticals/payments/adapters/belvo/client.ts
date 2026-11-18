/**
 * Belvo REST client — thin axios wrapper.
 *
 * Auth is HTTP Basic (`Authorization: Basic base64(secretId:secretPassword)`)
 * attached to every request — no bearer token, no refresh. Belvo paginates
 * DRF-style: every list response is `{ count, next, previous, results }`,
 * navigated with `page` / `page_size` query parameters. `get` returns a
 * single object; `list` follows `next` links until exhausted (capped) and
 * returns the flattened `results`.
 *
 * Docs: https://developers.belvo.com/reference/authentication-1
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, DEFAULT_PAGE_SIZE, HOSTS, type BelvoEnvironment } from './constants'

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

/** Belvo's DRF-style paginated envelope. */
export interface BelvoPage<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export class BelvoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as BelvoEnvironment) ?? DEFAULT_ENVIRONMENT
    const secretId = String(extra.secretId ?? '')
    this.http = axios.create({
      baseURL: HOSTS[env] ?? HOSTS[DEFAULT_ENVIRONMENT],
      auth: { username: secretId, password: credentials.accessToken },
      headers: {
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
   * Fetch one page of a list endpoint. Belvo returns at most `page_size`
   * (default 100) `results` per response plus a `next` cursor URL; callers
   * that need a single page pass `params.page`.
   */
  async list<T>(path: string, params?: Record<string, unknown>): Promise<BelvoPage<T>> {
    const merged = { page_size: DEFAULT_PAGE_SIZE, ...(params ?? {}) }
    return this.get<BelvoPage<T>>(path, merged)
  }
}
