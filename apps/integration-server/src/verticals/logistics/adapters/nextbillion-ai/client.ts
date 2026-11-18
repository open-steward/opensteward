import axios, { type AxiosInstance } from 'axios'
import { withRetry as withRetryBase } from '@opensteward/shared'
import { NEXTBILLION_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Thin HTTP client for NextBillion.ai REST APIs.
 *
 * Authentication: the API key is injected as a `key` query parameter on every
 * outbound request via an Axios request interceptor.
 */
export class NextBillionClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: NEXTBILLION_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    // Inject API key as query parameter on every request.
    this.http.interceptors.request.use((config) => {
      config.params = { key: this.apiKey, ...(config.params ?? {}) }
      return config
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, { params })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
