/**
 * Gallabox HTTP client.
 *
 * Authentication: every request carries two custom headers:
 *   apiKey: <credentials.accessToken>
 *   apiSecret: <credentials.extra.apiSecret>
 *
 * All resource endpoints are account-scoped:
 *   GET /devapi/accounts/:accountId/<resource>
 *
 * Rate limits: 429 is retried with exponential back-off (up to 4 retries).
 *
 * Docs: https://developers.gallabox.com/getting-started/overview
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

export class GallaboxClient {
  private http: AxiosInstance
  readonly accountId: string

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const apiSecret = String(credentials.extra?.['apiSecret'] ?? '')
    const accountId = String(credentials.extra?.['accountId'] ?? '')
    this.accountId = accountId
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        apiKey,
        apiSecret,
        'Content-Type': 'application/json',
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
