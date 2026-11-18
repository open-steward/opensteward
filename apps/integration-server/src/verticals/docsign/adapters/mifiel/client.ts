import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, QUERY_PATH } from './constants'
import { mifielAppId } from './auth'

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

export class MifielClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      // BasicAuth, `-u "$APP_ID:$APP_SECRET"` (https://docs.mifiel.com/en/api.json)
      auth: { username: mifielAppId(credentials), password: credentials.accessToken },
      headers: { Accept: 'application/json' },
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

  /** `POST /api/query` with a QueryRequest body. */
  async query<T>(body: Record<string, unknown>): Promise<T> {
    return this.post<T>(QUERY_PATH, body)
  }
}
