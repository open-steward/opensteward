/**
 * Helpwise V1 API HTTP client.
 *
 * Authentication: "the Basic auth header `Basic BASE_64(API_KEY:API_SECRET)`"
 * Base URL: https://apis.helpwise.io
 * Rate limit: "The limit is 100 requests per minute" (429 backoff applied)
 * Docs: https://documenter.getpostman.com/view/29744652/2s9YC5yYKf
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

function buildBasicAuth(credentials: Credentials): string {
  const apiKey = credentials.accessToken
  const apiSecret = String(credentials.extra?.['apiSecret'] ?? '')
  return 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
}

export class HelpwiseClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: buildBasicAuth(credentials),
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, params === undefined ? undefined : { params })
      return data
    })
  }
}
