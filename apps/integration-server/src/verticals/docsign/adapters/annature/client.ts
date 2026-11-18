import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { annaturePublicKey } from './auth'

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

export class AnnatureClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      // https://docs.annature.com.au/api-reference/authentication.md
      headers: {
        'X-Annature-Id': annaturePublicKey(credentials),
        'X-Annature-Key': credentials.accessToken,
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
