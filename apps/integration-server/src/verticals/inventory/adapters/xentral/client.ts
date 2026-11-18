/**
 * Xentral API HTTP client.
 *
 * Base URL: https://{xentralId}.xentral.biz
 * Auth:     Authorization: Bearer <personalAccessToken>
 * Pagination (V1 list endpoints):
 *   Request:  page[number]=<n>&page[size]=<s>  (deepObject style)
 *   Response: { data: T[], extra: { totalCount: number, page: { number, size } } }
 * Rate-limiting: 429 and 5xx responses retried with exponential back-off.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { normaliseXentralId } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 ||
          (status !== undefined && status >= 500 && status < 600)) &&
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

export class XentralClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Re-normalise on read: a row stored before validation existed must not
    // steer the PAT to a host outside xentral.biz.
    const xentralId = normaliseXentralId(credentials.extra?.['xentralId'])
    const baseURL = `https://${xentralId}.xentral.biz`
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
