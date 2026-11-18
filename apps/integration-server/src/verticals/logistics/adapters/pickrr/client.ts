import axios, { type AxiosInstance } from 'axios'
import { PICKRR_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class PickrrClient {
  private http: AxiosInstance
  private readonly authToken: string

  constructor(credentials: Credentials) {
    this.authToken = credentials.accessToken
    this.http = axios.create({
      baseURL: PICKRR_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * Merge auth_token into every request's query parameters.
   * Pickrr uses auth_token as a query parameter for all API calls.
   */
  private authParams(extra?: Record<string, unknown>): Record<string, unknown> {
    return { auth_token: this.authToken, ...extra }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.authParams(params) })
      return data
    })
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.authParams(params),
      })
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params: this.authParams(params) })
    })
  }
}
