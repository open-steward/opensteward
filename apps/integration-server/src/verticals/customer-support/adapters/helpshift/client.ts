/**
 * Helpshift HTTP client.
 *
 * Auth: HTTP Basic with api_key as username and empty password.
 * URL pattern: https://api.helpshift.com/v1/{domain}/{resource}
 * Pagination: page (1-based) + page-size query params; response includes total-pages.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

function getDomain(credentials: Credentials): string {
  const domain = credentials.extra?.['domain']
  if (!domain || typeof domain !== 'string') {
    throw new Error('helpshift: credentials.extra.domain is required')
  }
  return domain
}

export class HelpshiftClient {
  private http: AxiosInstance
  readonly domain: string

  constructor(credentials: Credentials) {
    this.domain = getDomain(credentials)
    // Helpshift uses HTTP Basic Auth: api_key as username, empty password
    const token = Buffer.from(`${credentials.accessToken}:`).toString('base64')
    this.http = axios.create({
      baseURL: `${API_BASE_URL}/${this.domain}`,
      headers: {
        Authorization: `Basic ${token}`,
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
