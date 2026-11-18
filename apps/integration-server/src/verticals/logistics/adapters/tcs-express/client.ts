import axios, { type AxiosInstance } from 'axios'
import { TCS_EXPRESS_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the TCS Express Logistics API v1.
 *
 * Authentication: X-API-Key header containing the API key.
 * Base URL: https://api.tcsexpresslogistics.com/v1
 */
export class TcsExpressClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: TCS_EXPRESS_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Key': credentials.accessToken,
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
