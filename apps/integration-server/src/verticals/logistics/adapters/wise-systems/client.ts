import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { WISE_SYSTEMS_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn() } catch (err) {
      const ae = err as AxiosError
      if (ae.response?.status === 429 && i < retries) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Wise Systems uses Bearer token auth.
 * For API-key integrations the key is passed directly as the bearer token.
 */
export class WiseSystemsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: WISE_SYSTEMS_API_BASE,
      headers: {
        Authorization: `bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => (await this.http.patch<T>(path, body)).data)
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
