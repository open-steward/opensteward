import axios, { type AxiosInstance } from 'axios'
import { SEAVANTAGE_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Thin Axios wrapper for the SeaVantage REST API.
 *
 * Authentication: the API key is supplied as the `authToken` query parameter
 * on every request (in addition to the `Authorization: Bearer` header for
 * forward-compatibility with the developer portal conventions).
 */
export class SeaVantageClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: SEAVANTAGE_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    })
  }

  async get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { authToken: this.apiKey, ...params },
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { authToken: this.apiKey },
      })
      return data
    })
  }
}
