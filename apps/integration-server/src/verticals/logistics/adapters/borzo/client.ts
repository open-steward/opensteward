import axios, { type AxiosInstance } from 'axios'
import { BORZO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the Borzo Business API v1.8.
 *
 * Authentication: X-DV-Auth-Token header containing the secret API token.
 * Base URL: https://robot-in.borzodelivery.com/api/business/1.8
 */
export class BorzoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: BORZO_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-DV-Auth-Token': credentials.accessToken,
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
