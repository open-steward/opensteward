/**
 * IntaSend REST client — thin axios wrapper.
 *
 * IntaSend uses Bearer-token auth (`Authorization: Bearer <secret-key>`) and
 * JSON request bodies. The host depends on the environment flag stored on the
 * credentials (sandbox vs live), and the shared `/api/v1` prefix is baked into
 * the base URL.
 *
 * List endpoints page by `page` and return `{ count, next, previous, results }`;
 * the adapter walks them (see `pageList` in index.ts).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PREFIX, baseUrl } from './constants'
import { isSandbox } from './auth'

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

export class IntasendClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${baseUrl(isSandbox(credentials))}${API_PREFIX}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
}
