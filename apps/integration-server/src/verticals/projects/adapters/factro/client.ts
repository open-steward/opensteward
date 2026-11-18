/**
 * Factro REST client.
 *
 * Auth: the API token is passed directly as the Authorization header value
 * (no "Bearer" prefix) — this matches the behaviour of the official C# client
 * (AuthenticationHeaderValue with scheme=token, no parameter).
 *
 * Base URL: https://cloud.factro.com/api/core/
 * Pagination: Factro returns plain arrays; no server-side paging tokens.
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

export class FactroClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${API_BASE_URL}/`,
      headers: {
        // Factro passes the raw token as the Authorization header value
        Authorization: credentials.accessToken,
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
