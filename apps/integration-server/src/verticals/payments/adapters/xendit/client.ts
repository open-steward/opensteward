import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

/**
 * Thin axios wrapper for the Xendit REST API.
 *
 * Auth is HTTP Basic: the secret key is the username, the password is empty.
 * `Buffer.from('<key>:').toString('base64')` yields the credential.
 *
 * Pagination on Xendit list endpoints (e.g. Refunds) is cursor-based via the
 * `limit`, `after_id`, and `before_id` query params; responses carry a `data`
 * array plus a `has_more` flag and `links` envelope. Single-resource reads
 * return the object directly with no envelope.
 */
export class XenditClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const basic = Buffer.from(`${credentials.accessToken ?? ''}:`).toString('base64')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${basic}`,
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
