import axios, { type AxiosInstance } from 'axios'
import { TOTAL_EXPRESS_API_BASE } from './constants'
import { buildAuthHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the Total Express API v1.
 *
 * Authentication: HTTP Basic Auth.
 *   username = credentials.accessToken
 *   password = credentials.extra?.password ?? ''
 * Base URL: https://api.totalexpress.com.br/v1
 */
export class TotalExpressClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: TOTAL_EXPRESS_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: buildAuthHeader(credentials),
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
