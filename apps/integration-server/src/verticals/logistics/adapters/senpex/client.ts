import axios, { type AxiosInstance } from 'axios'
import { SENPEX_API_BASE_PRODUCTION } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the Senpex Delivery API v4.
 *
 * Authentication: `clientid` and `secretid` request headers.
 * Both values are stored in `credentials.extra` at exchange time.
 */
export class SenpexClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const clientId = (extra.clientId as string | undefined) ?? credentials.accessToken
    const secretId = (extra.secretId as string | undefined) ?? ''

    this.http = axios.create({
      baseURL: SENPEX_API_BASE_PRODUCTION,
      headers: {
        clientid: clientId,
        secretid: secretId,
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

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }
}
