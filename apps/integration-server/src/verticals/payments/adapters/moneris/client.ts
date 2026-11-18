import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION } from './constants'
import { merchantIdOf } from './auth'

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

export class MonerisClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Throws (501) before any request when the connection has no merchant id.
    const merchantId = merchantIdOf(credentials)
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-Api-Key': credentials.accessToken,
        'X-Merchant-Id': merchantId,
        'Api-Version': API_VERSION,
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

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
