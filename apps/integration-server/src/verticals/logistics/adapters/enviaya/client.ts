import axios, { type AxiosInstance } from 'axios'
import { ENVIAYA_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class EnviaYaClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: ENVIAYA_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * Inject the api_key into a request body so either auth method works.
   */
  private withApiKey(body: Record<string, unknown>): Record<string, unknown> {
    return { api_key: this.apiKey, ...body }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { api_key: this.apiKey, ...params },
      })
      return data
    })
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, this.withApiKey(body))
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params: { api_key: this.apiKey },
      })
    })
  }
}
