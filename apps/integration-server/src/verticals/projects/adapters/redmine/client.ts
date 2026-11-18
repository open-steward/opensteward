import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_HOST } from './constants'

/**
 * Thin HTTP client for the Redmine REST API.
 *
 * Authentication: the API key is sent in the `X-Redmine-API-Key` header.
 *
 * Base URL: Redmine is self-hosted. The instance URL is stored in
 * `credentials.extra.host`; it falls back to `DEFAULT_HOST`.
 *
 * Pagination: query params `offset` (0-based) and `limit` (max 100).
 *
 * All endpoints use JSON format (`.json` suffix or `Accept: application/json`).
 */

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
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

export class RedmineClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = (credentials.accessToken ?? '').trim()
    if (!apiKey) {
      throw new Error('Redmine connection is missing the API key.')
    }
    const host =
      (typeof credentials.extra?.['host'] === 'string' ? credentials.extra['host'] : '') ||
      DEFAULT_HOST
    this.http = axios.create({
      baseURL: host.replace(/\/$/, ''),
      headers: {
        'X-Redmine-API-Key': apiKey,
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
}
