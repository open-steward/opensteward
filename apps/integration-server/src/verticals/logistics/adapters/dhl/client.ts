import axios, { type AxiosInstance } from 'axios'
import { DHL_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class DHLClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = (credentials.extra?.testMode ? DHL_API_BASE.replace('/mydhlapi', '/mydhlapi/test') : DHL_API_BASE)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: authHeader(credentials.accessToken),
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

  /**
   * `params` go on the query string — DHL's pickup cancel takes its two
   * mandatory inputs (`requestorName`, `reason`) that way, not in a body.
   */
  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }
}
