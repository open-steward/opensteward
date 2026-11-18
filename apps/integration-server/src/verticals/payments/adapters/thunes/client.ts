import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { readEndpoint } from './auth'

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

/** A response body with its headers: Thunes pages through headers (X-Next-Page, X-Next-Cursor). */
export interface ThunesResponse<T> {
  data: T
  headers: Record<string, unknown>
}

export class ThunesClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = readEndpoint(credentials)
    if (!baseURL) {
      throw Object.assign(
        new Error(
          'Thunes connection has no API endpoint ("Specific details relating to the endpoints will be provided upon account creation."). Reconnect with the API key, API secret and API endpoint.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    this.http = axios.create({
      baseURL,
      headers: {
        // accessToken is base64("API_KEY:API_SECRET"), see auth.ts.
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<ThunesResponse<T>> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      return { data: res.data, headers: (res.headers ?? {}) as Record<string, unknown> }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
