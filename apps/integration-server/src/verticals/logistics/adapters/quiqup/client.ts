import axios, { type AxiosInstance } from 'axios'
import { QUIQUP_API_BASE } from './constants'
import { authHeader, isTokenExpired, refreshCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class QuiqupClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: QUIQUP_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * Ensure credentials are still valid, refreshing if needed.
   * Updates the Authorization header on the underlying axios instance.
   */
  private async ensureFresh(): Promise<void> {
    if (isTokenExpired(this.credentials)) {
      this.credentials = await refreshCredentials(this.credentials)
      this.http.defaults.headers.common['Authorization'] = authHeader(
        this.credentials.accessToken,
      )
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensureFresh()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    await this.ensureFresh()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    await this.ensureFresh()
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    await this.ensureFresh()
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
