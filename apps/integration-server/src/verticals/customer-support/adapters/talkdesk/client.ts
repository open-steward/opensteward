/**
 * Talkdesk API HTTP client.
 *
 * Auth: Bearer token in Authorization header.
 * Base URL is region-aware (US default; EU / Canada supported via
 * credentials.extra.region).
 * Pagination: page[number] / page[size] query params; list responses
 * use _embedded.<resource>[] plus _links hypermedia for next page.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_BY_REGION } from './constants'
import { normaliseRegion } from './auth'

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

export class TalkdeskClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // An unrecognised stored region throws rather than quietly using the US host.
    const region = normaliseRegion(credentials.extra?.['region'] as string | undefined)
    const baseURL = API_BASE_URL_BY_REGION[region]!
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
