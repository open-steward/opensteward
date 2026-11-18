/**
 * Gr4vy REST API client — thin axios wrapper.
 *
 * Base URL is derived per-merchant from the instance id + environment stored on
 * the credentials (see {@link buildBaseUrl}). Auth is a fresh ES512 Bearer JWT
 * minted for every request from the merchant's private key (see
 * {@link buildBearerToken}) — Gr4vy tokens are short-lived, so signing per call
 * keeps them well inside the validity window without any token cache.
 *
 * List endpoints are cursor-paginated: pass `limit` plus `cursor`; the response
 * carries `items`, `limit`, `next_cursor`, and `previous_cursor`.
 *
 * Docs: https://docs.gr4vy.com/guides/api/connectivity
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl, DEFAULT_SCOPES } from './constants'
import { buildBearerToken, readAuthConfig, type Gr4vyAuthConfig } from './auth'

/** Standard list envelope returned by every Gr4vy collection endpoint. */
export interface Gr4vyList<T> {
  items?: T[]
  limit?: number
  next_cursor?: string | null
  previous_cursor?: string | null
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
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

export class Gr4vyClient {
  private http: AxiosInstance
  private config: Gr4vyAuthConfig

  constructor(credentials: Credentials) {
    this.config = readAuthConfig(credentials)
    this.http = axios.create({
      baseURL: buildBaseUrl(this.config.gr4vyId, this.config.environment),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })
  }

  private authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${buildBearerToken(this.config, DEFAULT_SCOPES)}` }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () => (await this.http.get<T>(path, { params, headers: this.authHeader() })).data,
    )
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(
      async () => (await this.http.post<T>(path, body, { headers: this.authHeader() })).data,
    )
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(
      async () => (await this.http.put<T>(path, body, { headers: this.authHeader() })).data,
    )
  }

  async delete(path: string): Promise<void> {
    await withRetry(async () => (await this.http.delete(path, { headers: this.authHeader() })).data)
  }
}
