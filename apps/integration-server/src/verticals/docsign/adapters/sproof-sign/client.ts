/**
 * sproof Sign REST API client.
 *
 * Base URL and auth from https://sign.sproof.com/api/v1/documentation/json:
 * `servers[0].url` "https://sign.sproof.com/api/v1", and every operation takes
 * the API key as the `token` query parameter ("Token for authentication (e.g.
 * your API key)"). The spec declares no header scheme. Retries 429 + 5xx with
 * exponential backoff.
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

export class SproofSignClient {
  private http: AxiosInstance
  private token: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    if (!token) throw new Error('sproof-sign: credentials carry no API key')
    this.token = token
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: { ...params, token: this.token } })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { token: this.token },
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
