import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, API_KEY_BASIC_PASSWORD } from './constants'

/**
 * Thin HTTP client for the Paymo REST API.
 *
 * Authentication is HTTP Basic with the API key as the username and an
 * arbitrary non-empty password (`x`); the pair is base64-encoded into the
 * `Authorization: Basic …` header.
 *
 * List responses are NOT paginated — Paymo returns the whole collection under
 * a plural key (e.g. `{ "projects": [...] }`). Server-side filtering is done
 * with the `where` query parameter (e.g. `where=project_id=123`).
 */
export class PaymoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = (credentials.accessToken ?? '').trim()
    if (!apiKey) {
      throw new Error('Paymo connection is missing the API key.')
    }
    const basic = Buffer.from(`${apiKey}:${API_KEY_BASIC_PASSWORD}`).toString('base64')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${basic}`,
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
}
