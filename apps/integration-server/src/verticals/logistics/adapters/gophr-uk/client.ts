import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { GOPHR_UK_API_BASE, GOPHR_UK_API_KEY_HEADER } from './constants'
import type { Credentials } from '../../adapter/interface'

/**
 * Exponential back-off retry for transient errors (429, 5xx).
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const ae = err as AxiosError
      const status = ae.response?.status
      if ((status === 429 || (status !== undefined && status >= 500)) && attempt < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
        continue
      }
      throw err
    }
  }
  // unreachable — TypeScript needs the explicit throw
  throw new Error('GophrUkClient: retry limit exceeded')
}

export class GophrUkClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: GOPHR_UK_API_BASE,
      headers: {
        [GOPHR_UK_API_KEY_HEADER]: credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
