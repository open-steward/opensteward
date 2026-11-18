import axios, { type AxiosInstance } from 'axios'
import { CLICKPOST_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * ClickPost HTTP client.
 *
 * Authentication: ClickPost uses query-parameter-based auth:
 *   key=<api-key>  (required)
 *   username=<username>  (required for most mutation endpoints)
 *
 * These are injected into every request via axios params interceptor.
 */
export class ClickPostClient {
  private http: AxiosInstance
  private apiKey: string
  private username: string | undefined

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.username = (credentials.extra as Record<string, unknown> | undefined)
      ?.username as string | undefined

    this.http = axios.create({
      baseURL: CLICKPOST_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    // Inject auth params into every request
    this.http.interceptors.request.use((config) => {
      config.params = {
        key: this.apiKey,
        ...(this.username ? { username: this.username } : {}),
        ...config.params,
      }
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
}
