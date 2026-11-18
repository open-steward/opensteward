import axios, { type AxiosInstance } from 'axios'
import { POSTDK_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Post Danmark (PostNord DK) uses API key as a query parameter.
 * The apikey is appended to every request as a query param.
 */
export class PostDkClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: POSTDK_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { ...params, apikey: this.apiKey },
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { ...params, apikey: this.apiKey },
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params: { apikey: this.apiKey },
      })
    })
  }
}
